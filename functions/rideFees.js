// Cancel and no-show fees on app rides. Taken from the rider's card hold;
// anything the hold can't cover is owed and added to the rider's next card
// payment. The fee goes to the driver's lease credit. Card fees, memberships
// and the $5 Priority Day Pass are the company's and never reach this file.
const admin = require("firebase-admin");
const BRANDING = require("./branding.json");

const FieldValue = admin.firestore.FieldValue;
const db = () => admin.firestore();
const RULES = BRANDING.rideRules || {};

/** Credit a fee to the driver once per ride (radio cars without an app driver are skipped). */
async function creditDriverFee(uid, rideId, cents, kind) {
  if (!uid || !(cents > 0) || RULES.feesGoToDriver === false) return false;
  return db().runTransaction(async (tx) => {
    const driverRef = db().collection("drivers").doc(uid);
    const entryRef = db().collection("ledger").doc(uid).collection("entries").doc(`fee_${rideId}`);
    const [ds, es] = await Promise.all([tx.get(driverRef), tx.get(entryRef)]);
    if (!ds.exists || es.exists) return false;
    tx.set(entryRef, { type: kind, rideId, cents, at: Date.now() });
    tx.update(driverRef, { leaseCreditCents: FieldValue.increment(cents) });
    return true;
  });
}

/**
 * Charge a cancel or no-show fee. Captures part of the card hold (Stripe
 * releases the rest), otherwise records it as owed on the rider's account.
 */
async function chargeRideFee({ stripe, ride, rideId, cents, kind }) {
  if (!(cents > 0)) return { status: "none", cents: 0, chargedCents: 0, owedCents: 0 };
  let chargedCents = 0;
  if (ride.paymentMethod === "card" && ride.paymentIntentId && stripe) {
    try {
      const intent = await stripe.paymentIntents.retrieve(ride.paymentIntentId);
      const capturable = intent.amount_capturable ?? intent.amount ?? 0;
      if (intent.status === "requires_capture" && capturable > 0) {
        chargedCents = Math.min(cents, capturable);
        await stripe.paymentIntents.capture(ride.paymentIntentId, { amount_to_capture: chargedCents }, { idempotencyKey: `fee_${rideId}` });
      }
    } catch (e) {
      // A timeout can hide a capture that went through: look before calling it unpaid.
      console.warn("fee capture failed", rideId, e?.message);
      const again = await stripe.paymentIntents.retrieve(ride.paymentIntentId).catch(() => null);
      chargedCents = again?.status === "succeeded" ? Math.min(cents, again.amount_received ?? 0) : 0;
    }
  }
  const owedCents = cents - chargedCents;
  const status = owedCents === 0 ? "charged" : chargedCents > 0 ? "partly_charged" : "owed";
  const at = Date.now();
  const batch = db().batch();
  batch.set(db().collection("rides").doc(rideId), { fee: { kind, cents, chargedCents, owedCents, status, at } }, { merge: true });
  const member = ride.customerId && ride.customerId !== "guest";
  if (owedCents > 0 && member) {
    batch.set(
      db().collection("users").doc(ride.customerId),
      {
        feesOwedCents: FieldValue.increment(owedCents),
        feesOwed: FieldValue.arrayUnion({ rideId, kind, cents: owedCents, driverId: ride.driverId || null, at }),
      },
      { merge: true }
    );
  }
  await batch.commit();
  if (chargedCents > 0) await creditDriverFee(ride.driverId, rideId, chargedCents, kind);
  return { status, cents, chargedCents, owedCents };
}

/** After an owed fee is collected on a later card payment: clear it and pay each driver. */
async function settleOwedFees(uid, owed) {
  if (!uid || !owed?.length) return;
  // Take off exactly what was collected; a fee added meanwhile stays owed.
  const cents = owed.reduce((n, f) => n + (f.cents || 0), 0);
  await db()
    .collection("users")
    .doc(uid)
    .update({ feesOwedCents: FieldValue.increment(-cents), feesOwed: FieldValue.arrayRemove(...owed) });
  for (const f of owed) await creditDriverFee(f.driverId, `${f.rideId}_owed`, f.cents, f.kind);
}

module.exports = { chargeRideFee, creditDriverFee, settleOwedFees };
