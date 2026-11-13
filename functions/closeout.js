// Close Out: a driver quits or is let go. That day's full lease comes out
// first (any unpaid lease too), then he's paid half of what's left of his
// card credit, by check from Malcolm. Credit short of the lease = he owes it.
//
//   payouts/{id}: the computation, then the check # / date once Malcolm writes it.
//
// Policy assumptions to confirm with Malcolm (shown on the statement):
//  - unpaid envelope money is taken out of credit before the 50% split
//  - card fares from the current, unsettled lease day count toward his credit
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { LEASE_CFG } = require("./workRules");
const { _internal: lease } = require("./lease");

const db = () => admin.firestore();
let corePromise = null;
const core = () => (corePromise ||= import("./lib/dispatchCore.mjs"));

const driverRef = (uid) => db().collection("drivers").doc(uid);
const dayRef = (uid, key) => db().collection("ledger").doc(uid).collection("days").doc(key);

function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Dispatcher access required.");
  }
  return request.auth.uid;
}

/** The close-out math from a driver record and his current (unsettled) lease day. */
function compute(c, driver, day) {
  const creditCents = driver.leaseCreditCents ?? 0;
  const cardTodayCents = (day?.cardFaresCents ?? 0) + (LEASE_CFG.lease.includeTips ? day?.cardTipsCents ?? 0 : 0);
  const unpaidCents = driver.leaseOwedCents ?? 0;
  const finalLeaseCents = Math.max(0, LEASE_CFG.lease.dailyCents - (day?.discountCents ?? 0));
  const r = c.closeOut(
    { creditCents: creditCents + cardTodayCents - unpaidCents },
    { ...LEASE_CFG.lease, dailyCents: finalLeaseCents }
  );
  return {
    creditCents,
    cardTodayCents,
    unpaidCents,
    finalLeaseCents,
    afterFinalDayCents: r.afterFinalDayCents,
    pct: LEASE_CFG.lease.exitPayoutPct,
    payoutCents: r.payoutCents,
    owedAfterCents: r.owedCents,
  };
}

/** Settle any earlier lease days still open, so credit/owed are current. */
async function settleOlder(c, uid, currentKey, nowMs) {
  const open = await db().collection("ledger").doc(uid).collection("days").where("open", "==", true).get();
  const older = open.docs.map((d) => d.id).filter((k) => k < currentKey).sort();
  for (const k of older) await lease.settlePeriod(c, uid, k, nowMs);
}

exports.closeOutPreview = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const c = await core();
  const nowMs = Date.now();
  const key = c.leasePeriodKey(nowMs, LEASE_CFG);
  const [ds, ps] = await Promise.all([driverRef(uid).get(), dayRef(uid, key).get()]);
  if (!ds.exists) throw new HttpsError("not-found", "Driver not found.");
  // Older open days aren't settled in a preview; estimate them at a full lease each.
  const open = await db().collection("ledger").doc(uid).collection("days").where("open", "==", true).get();
  const olderOpen = open.docs.filter((d) => d.id < key);
  let driver = ds.data();
  if (olderOpen.length) {
    driver = { ...driver };
    for (const d of olderOpen.sort((a, b) => a.id.localeCompare(b.id))) {
      const s = c.settleLease(
        {
          creditInCents: driver.leaseCreditCents ?? 0,
          cardFaresCents: d.data().cardFaresCents ?? 0,
          cardTipsCents: d.data().cardTipsCents ?? 0,
          discountCents: d.data().discountCents ?? 0,
        },
        LEASE_CFG.lease
      );
      driver.leaseCreditCents = s.creditOutCents;
      driver.leaseOwedCents = (driver.leaseOwedCents ?? 0) + s.envelopeCents;
    }
  }
  return { ...compute(c, driver, ps.data()), periodKey: key, olderDaysSettled: olderOpen.length };
});

exports.closeOutDriver = onCall(async (request) => {
  const by = requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const reason = request.data?.reason;
  const note = String(request.data?.note || "").slice(0, 300);
  if (!["quit", "fired"].includes(reason)) throw new HttpsError("invalid-argument", "Pick quit or let go.");
  const c = await core();
  const nowMs = Date.now();
  const key = c.leasePeriodKey(nowMs, LEASE_CFG);

  const pre = await db().collection("board").doc(uid).get();
  if (["on_call", "offered"].includes(pre.data()?.status)) {
    throw new HttpsError("failed-precondition", "He has a call right now. Close out after the drop-off.");
  }
  await settleOlder(c, uid, key, nowMs);

  const payoutRef = db().collection("payouts").doc();
  const result = await db().runTransaction(async (tx) => {
    const [ds, ps, bs] = await Promise.all([tx.get(driverRef(uid)), tx.get(dayRef(uid, key)), tx.get(db().collection("board").doc(uid))]);
    const driver = ds.data();
    if (!driver) throw new HttpsError("not-found", "Driver not found.");
    if (driver.active === false) throw new HttpsError("failed-precondition", "Already closed out.");
    if (["on_call", "offered"].includes(bs.data()?.status)) {
      throw new HttpsError("failed-precondition", "He has a call right now. Close out after the drop-off.");
    }
    const m = compute(c, driver, ps.data());

    tx.set(
      dayRef(uid, key),
      {
        periodKey: key,
        open: false,
        settledAt: nowMs,
        closeOut: true,
        creditInCents: m.creditCents,
        leaseDueCents: m.finalLeaseCents,
        envelopeDueCents: 0,
        creditOutCents: 0,
      },
      { merge: true }
    );
    tx.update(driverRef(uid), {
      active: false,
      status: "closed",
      closedAt: nowMs,
      closedReason: reason,
      leaseCreditCents: 0,
      leaseOwedCents: m.owedAfterCents,
      leaseOwedPeriodKey: m.owedAfterCents > 0 ? driver.leaseOwedPeriodKey || key : null,
      ...(m.owedAfterCents > 0 ? {} : { leaseOwedPeriods: [] }),
      lastPayoutId: payoutRef.id,
    });
    if (bs.exists) tx.delete(bs.ref);
    tx.set(db().collection("driverLocations").doc(uid), { live: false }, { merge: true });
    tx.set(payoutRef, {
      driverId: uid,
      carNumber: driver.carNumber || null,
      driverName: driver.name || null,
      reason,
      note,
      periodKey: key,
      ...m,
      status: m.payoutCents > 0 ? "awaiting_check" : "no_payout",
      createdAt: nowMs,
      createdBy: by,
    });
    tx.set(db().collection("ledger").doc(uid).collection("entries").doc(`closeout_${nowMs}`), {
      type: "close_out",
      payoutId: payoutRef.id,
      payoutCents: m.payoutCents,
      owedAfterCents: m.owedAfterCents,
      by,
      at: nowMs,
    });
    return m;
  });

  // He can't use the driver app any more.
  try {
    const user = await admin.auth().getUser(uid);
    await admin.auth().setCustomUserClaims(uid, { ...(user.customClaims || {}), driver: false });
  } catch (e) {
    console.warn("Couldn't remove driver access:", e.message);
  }
  return { ok: true, payoutId: payoutRef.id, ...result };
});

exports.recordPayoutCheck = onCall(async (request) => {
  const by = requireAdmin(request);
  const id = String(request.data?.payoutId || "");
  const checkNumber = String(request.data?.checkNumber || "").trim().slice(0, 20);
  const checkDate = String(request.data?.checkDate || "");
  if (!checkNumber || !/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) throw new HttpsError("invalid-argument", "Enter the check number and date.");
  return db().runTransaction(async (tx) => {
    const ref = db().collection("payouts").doc(id);
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError("not-found", "Payout not found.");
    if (s.data().status !== "awaiting_check") throw new HttpsError("failed-precondition", "Nothing to pay on this one.");
    tx.update(ref, { status: "paid", checkNumber, checkDate, paidBy: by, paidAt: Date.now() });
    return { ok: true };
  });
});

module.exports._internal = { compute };
