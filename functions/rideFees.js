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
 * Charge a ride's card. The booking hold checked the card and saved it for
 * this ride (a hold can't be raised later on most cards), so:
 *  - preferHold (fees, at most the hold): take it from the hold; anything over
 *    the hold is a second charge to the saved card;
 *  - otherwise (the fare): one charge to the saved card, then the hold is
 *    released; if the bank wants the rider to approve it, take what the hold covers.
 * Returns what was charged and what is still owed.
 */
async function chargeSavedCard({ stripe, ride, rideId, cents, key, preferHold = false }) {
  if (!(cents > 0) || !stripe || !ride.paymentIntentId) return { chargedCents: 0, owedCents: Math.max(0, cents || 0) };
  const hold = await stripe.paymentIntents.retrieve(ride.paymentIntentId).catch(() => null);
  const held = hold?.status === "requires_capture";
  const offSession = async (amount, k) => {
    if (!(amount > 0) || !hold?.payment_method || !hold?.customer) return 0;
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount,
          currency: "usd",
          customer: hold.customer,
          payment_method: hold.payment_method,
          off_session: true,
          confirm: true,
          metadata: { rideId, uid: ride.customerId || "guest" },
        },
        { idempotencyKey: k }
      );
      return pi.status === "succeeded" ? amount : 0;
    } catch (e) {
      console.warn("saved-card charge failed", rideId, e?.code || e?.message);
      return 0;
    }
  };
  const fromHold = async (amount) => {
    const capturable = held ? (hold.amount_capturable ?? hold.amount ?? 0) : 0;
    const take = Math.min(amount, capturable);
    if (!(take > 0)) return 0;
    try {
      await stripe.paymentIntents.capture(ride.paymentIntentId, { amount_to_capture: take }, { idempotencyKey: `${key}_hold` });
      return take;
    } catch (e) {
      // A timeout can hide a capture that went through: look before calling it unpaid.
      console.warn("hold capture failed", rideId, e?.message);
      const again = await stripe.paymentIntents.retrieve(ride.paymentIntentId).catch(() => null);
      return again?.status === "succeeded" ? Math.min(take, again.amount_received ?? 0) : 0;
    }
  };

  let charged = 0;
  if (preferHold) {
    charged = await fromHold(cents);
    charged += await offSession(cents - charged, `${key}_rest`);
  } else {
    charged = await offSession(cents, key);
    if (charged > 0) {
      if (held) await stripe.paymentIntents.cancel(ride.paymentIntentId).catch(() => {});
    } else {
      charged = await fromHold(cents);
    }
  }
  return { chargedCents: charged, owedCents: cents - charged };
}

/** Something a member still owes (a fee, or the part of a fare their card didn't cover). */
async function recordOwed(ride, rideId, cents, kind) {
  if (!(cents > 0) || !ride.customerId || ride.customerId === "guest") return;
  await db()
    .collection("users")
    .doc(ride.customerId)
    .set(
      {
        feesOwedCents: FieldValue.increment(cents),
        feesOwed: FieldValue.arrayUnion({ rideId, kind, cents, driverId: ride.driverId || null, at: Date.now() }),
      },
      { merge: true }
    );
}

/**
 * Charge a cancel or no-show fee: from the card hold first, the rest to the
 * saved card; anything left is owed on the rider's account.
 */
async function chargeRideFee({ stripe, ride, rideId, cents, kind }) {
  if (!(cents > 0)) return { status: "none", cents: 0, chargedCents: 0, owedCents: 0 };
  let chargedCents = 0;
  if (ride.paymentMethod === "card" && ride.paymentIntentId && stripe) {
    chargedCents = (await chargeSavedCard({ stripe, ride, rideId, cents, key: `fee_${rideId}`, preferHold: true })).chargedCents;
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
  // Fees go to the driver now; an unpaid part of a fare was already credited
  // to him with the fare, so the company keeps that when it comes in.
  for (const f of owed) if (f.kind !== "fare_balance") await creditDriverFee(f.driverId, `${f.rideId}_owed`, f.cents, f.kind);
}

module.exports = { chargeRideFee, chargeSavedCard, recordOwed, creditDriverFee, settleOwedFees };
