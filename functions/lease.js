// Lease ("lick") ledger: $75 a day, due 2-4 PM, for every day a driver is
// on the board. Card fares + tips he earns (paid to the company) count
// toward it; anything above $75 rolls forward as credit, forever. Short →
// cash envelope in the lobby safe, logged in the app, counted by the office.
// Not paid by 4 PM → locked out of the board until it is.
//
//   ledger/{uid}/days/{periodKey}   one lease period (2 PM → 2 PM, keyed by due date)
//   ledger/{uid}/entries/{id}       card fares, adjustments (audit trail)
//   envelopes/{id}                  envelope drops and the office count
//   drivers/{uid}: leaseCreditCents, leaseOwedCents, leaseOwedPeriodKey
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { requireDriver, LEASE_CFG } = require("./workRules");

const FieldValue = admin.firestore.FieldValue;
const db = () => admin.firestore();
let corePromise = null;
const core = () => (corePromise ||= import("./lib/dispatchCore.mjs"));

const driverRef = (uid) => db().collection("drivers").doc(uid);
const boardRef = (uid) => db().collection("board").doc(uid);
const dayRef = (uid, key) => db().collection("ledger").doc(uid).collection("days").doc(key);
const entryRef = (uid, id) => db().collection("ledger").doc(uid).collection("entries").doc(id);
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Dispatcher access required.");
  }
  return request.auth.uid;
}

/**
 * Settle one open period: lease due vs. credit carried in + card money.
 * Must run oldest period first per driver (credit flows forward).
 */
async function settlePeriod(c, uid, key, nowMs) {
  return db().runTransaction(async (tx) => {
    const [ds, ps] = await Promise.all([tx.get(driverRef(uid)), tx.get(dayRef(uid, key))]);
    const day = ps.data();
    if (!ds.exists || !day || day.settledAt) return null;
    const driver = ds.data();
    // He chose to hold his banked credit for this day: it stays untouched and
    // the lease comes from this day's card money and his envelope.
    const held = driver.holdCreditPeriod === key;
    const s = c.settleLease(
      {
        creditInCents: held ? 0 : driver.leaseCreditCents ?? 0,
        cardFaresCents: day.cardFaresCents ?? 0,
        cardTipsCents: day.cardTipsCents ?? 0,
        discountCents: day.discountCents ?? 0,
      },
      LEASE_CFG.lease
    );
    tx.update(dayRef(uid, key), {
      open: false,
      settledAt: nowMs,
      creditInCents: held ? 0 : driver.leaseCreditCents ?? 0,
      heldCreditCents: held ? driver.leaseCreditCents ?? 0 : 0,
      leaseDueCents: s.leaseDueCents,
      availableCents: s.availableCents,
      envelopeDueCents: s.envelopeCents,
      creditOutCents: s.creditOutCents,
      coveredByCard: s.coveredByCard,
    });
    const patch = { leaseCreditCents: s.creditOutCents + (held ? driver.leaseCreditCents ?? 0 : 0), ...(held ? { holdCreditPeriod: null } : {}) };
    if (s.envelopeCents > 0) {
      patch.leaseOwedCents = (driver.leaseOwedCents ?? 0) + s.envelopeCents;
      patch.leaseOwedPeriodKey = driver.leaseOwedCents > 0 ? driver.leaseOwedPeriodKey : key;
      patch.leaseOwedPeriods = FieldValue.arrayUnion(key);
    }
    tx.update(driverRef(uid), patch);
    return s;
  });
}

async function settleDue(nowMs = Date.now()) {
  const c = await core();
  const today = c.localDateKey(nowMs, LEASE_CFG.timeZone);
  const window = c.leaseWindow(nowMs, LEASE_CFG);
  // Periods are due on their key date at 2 PM; before 2 PM only older ones are due.
  const snap = await db()
    .collectionGroup("days")
    .where("open", "==", true)
    .where("periodKey", window === "before_window" ? "<" : "<=", today)
    .get();
  const due = snap.docs
    .map((d) => ({ uid: d.ref.parent.parent.id, key: d.id }))
    .sort((a, b) => a.uid.localeCompare(b.uid) || a.key.localeCompare(b.key));
  let settled = 0;
  for (const p of due) if (await settlePeriod(c, p.uid, p.key, nowMs)) settled++;
  return settled;
}

// 2 PM: close the period, show each driver his envelope amount (or "paid by card").
exports.settleLeases = onSchedule(
  { schedule: `every day ${LEASE_CFG.lease.dueStart}`, timeZone: LEASE_CFG.timeZone },
  async () => {
    const n = await settleDue();
    console.log(`Settled ${n} lease period(s).`);
    return null;
  }
);

async function lockUnpaid(nowMs = Date.now()) {
  const c = await core();
  const snap = await db().collection("drivers").where("leaseOwedCents", ">", 0).get();
  let locked = 0;
  for (const d of snap.docs) {
    const driver = d.data();
    if (!c.leaseLocked({ owedCents: driver.leaseOwedCents, owedPeriodKey: driver.leaseOwedPeriodKey, now: nowMs }, LEASE_CFG)) continue;
    const did = await db().runTransaction(async (tx) => {
      const b = await tx.get(boardRef(d.id));
      if (!b.exists || !["ready", "moving"].includes(b.data().status)) return false;
      tx.update(boardRef(d.id), {
        status: "offline",
        zoneId: null,
        lineKey: null,
        lastEvent: { type: "lease_lock", owedCents: driver.leaseOwedCents, at: nowMs },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (did) locked++;
  }
  return locked;
}

// 4 PM: anyone still owing comes off the board until the envelope is logged.
exports.leaseLockSweep = onSchedule(
  { schedule: `every day ${LEASE_CFG.lease.dueEnd}`, timeZone: LEASE_CFG.timeZone },
  async () => {
    const n = await lockUnpaid();
    if (n) console.log(`Took ${n} driver(s) off the board: lease not paid.`);
    return null;
  }
);

// Card fare settled on a ride this driver ran → his ledger.
exports.creditCardFare = onDocumentUpdated("rides/{rideId}", async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.finalFare != null || after.finalFare == null || !after.driverId) return;
  const c = await core();
  const credit = c.cardCreditCents(after, LEASE_CFG.lease);
  if (!credit) return;
  const uid = after.driverId;
  const rideId = event.params.rideId;
  const nowMs = Date.now();
  const key = c.leasePeriodKey(nowMs, LEASE_CFG);
  await db().runTransaction(async (tx) => {
    const [ds, es, ps] = await Promise.all([tx.get(driverRef(uid)), tx.get(entryRef(uid, `ride_${rideId}`)), tx.get(dayRef(uid, key))]);
    if (!ds.exists || es.exists) return; // radio car, or already credited
    tx.set(entryRef(uid, `ride_${rideId}`), {
      type: "card_fare",
      rideId,
      fareCents: credit.fareCents,
      tipCents: credit.tipCents,
      periodKey: key,
      at: nowMs,
    });
    const total = credit.fareCents + credit.tipCents;
    if (ps.data()?.settledAt) {
      // Landed after its period closed: straight to his credit balance.
      tx.update(driverRef(uid), { leaseCreditCents: FieldValue.increment(total) });
    } else {
      tx.set(
        dayRef(uid, key),
        {
          periodKey: key,
          open: true,
          cardFaresCents: FieldValue.increment(credit.fareCents),
          cardTipsCents: FieldValue.increment(credit.tipCents),
          cardRides: FieldValue.increment(1),
        },
        { merge: true }
      );
    }
  });
});

// Driver: "I dropped my envelope" — logs exactly what he owes.
exports.logEnvelope = onCall(async (request) => {
  const uid = requireDriver(request);
  const nowMs = Date.now();
  return db().runTransaction(async (tx) => {
    const ds = await tx.get(driverRef(uid));
    const driver = ds.data();
    const owed = driver?.leaseOwedCents ?? 0;
    if (owed <= 0) throw new HttpsError("failed-precondition", "You don't owe anything right now.");
    const env = db().collection("envelopes").doc();
    tx.set(env, {
      driverId: uid,
      carNumber: driver.carNumber || null,
      driverName: driver.name || null,
      amountCents: owed,
      periodKeys: driver.leaseOwedPeriods || [driver.leaseOwedPeriodKey].filter(Boolean),
      droppedAt: nowMs,
      status: "dropped",
    });
    tx.update(driverRef(uid), {
      leaseOwedCents: 0,
      leaseOwedPeriodKey: null,
      leaseOwedPeriods: [],
      lastEnvelope: { id: env.id, amountCents: owed, droppedAt: nowMs },
    });
    return { ok: true, amountCents: owed, envelopeId: env.id };
  });
});

// Office counts the safe: amount received; a short envelope is flagged.
exports.receiveEnvelope = onCall(async (request) => {
  const by = requireAdmin(request);
  const id = String(request.data?.envelopeId || "");
  const receivedCents = Math.round(Number(request.data?.receivedCents));
  if (!id || !Number.isFinite(receivedCents) || receivedCents < 0) throw new HttpsError("invalid-argument", "Enter what was in the envelope.");
  const c = await core();
  return db().runTransaction(async (tx) => {
    const ref = db().collection("envelopes").doc(id);
    const s = await tx.get(ref);
    const env = s.data();
    if (!env) throw new HttpsError("not-found", "Envelope not found.");
    if (env.status !== "dropped") throw new HttpsError("failed-precondition", "Already counted.");
    const mismatchCents = c.envelopeMismatch(env.amountCents, receivedCents);
    tx.update(ref, { status: "received", receivedCents, mismatchCents, receivedAt: Date.now(), receivedBy: by });
    return { ok: true, mismatchCents };
  });
});

/**
 * Office adjustments, all on the audit trail:
 *   credit  ± lease credit (e.g. bonus, correction)
 *   owe     + amount owed (e.g. short envelope) / − to forgive
 *   waive   no lease for a period that hasn't settled yet (sets its discount to the full lease)
 */
exports.adjustLease = onCall(async (request) => {
  const by = requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const kind = request.data?.kind;
  const cents = Math.round(Number(request.data?.cents || 0));
  const note = String(request.data?.note || "").slice(0, 200);
  const periodKey = request.data?.periodKey ? String(request.data.periodKey) : null;
  if (!uid || !["credit", "owe", "waive"].includes(kind)) throw new HttpsError("invalid-argument", "Bad adjustment.");
  if (kind !== "waive" && (!Number.isFinite(cents) || cents === 0 || Math.abs(cents) > 500000)) {
    throw new HttpsError("invalid-argument", "Enter an amount.");
  }
  const c = await core();
  const nowMs = Date.now();
  const envelopeId = request.data?.envelopeId ? String(request.data.envelopeId) : null;
  return db().runTransaction(async (tx) => {
    const ds = await tx.get(driverRef(uid));
    if (!ds.exists) throw new HttpsError("not-found", "Driver not found.");
    const driver = ds.data();
    const envRef = envelopeId ? db().collection("envelopes").doc(envelopeId) : null;
    if (envRef) {
      const es = await tx.get(envRef);
      if (!es.exists || es.data().driverId !== uid) throw new HttpsError("not-found", "Envelope not found.");
      if (es.data().shortHandledAt) throw new HttpsError("failed-precondition", "Already added.");
    }
    const entry = entryRef(uid, `adj_${nowMs}`);
    if (kind === "waive") {
      const key = periodKey || c.leasePeriodKey(nowMs, LEASE_CFG);
      const ps = await tx.get(dayRef(uid, key));
      if (ps.data()?.settledAt) throw new HttpsError("failed-precondition", "That day is already settled. Use a credit instead.");
      tx.set(dayRef(uid, key), { periodKey: key, open: true, discountCents: LEASE_CFG.lease.dailyCents, waivedBy: by, waiveNote: note }, { merge: true });
      tx.set(entry, { type: "waive", periodKey: key, note, by, at: nowMs });
      return { ok: true };
    }
    if (kind === "credit") {
      const next = (driver.leaseCreditCents ?? 0) + cents;
      if (next < 0) throw new HttpsError("failed-precondition", `He only has ${money(driver.leaseCreditCents ?? 0)} credit.`);
      tx.update(driverRef(uid), { leaseCreditCents: next });
    } else {
      const next = Math.max(0, (driver.leaseOwedCents ?? 0) + cents);
      tx.update(driverRef(uid), {
        leaseOwedCents: next,
        leaseOwedPeriodKey: next > 0 ? driver.leaseOwedPeriodKey || c.localDateKey(nowMs, LEASE_CFG.timeZone) : null,
        ...(next === 0 ? { leaseOwedPeriods: [] } : {}),
      });
    }
    if (envRef) tx.update(envRef, { shortHandledAt: nowMs });
    tx.set(entry, { type: kind, cents, note, by, at: nowMs, ...(envelopeId ? { envelopeId } : {}) });
    return { ok: true };
  });
});

module.exports._internal = { settleDue, lockUnpaid, settlePeriod };
