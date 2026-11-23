// The app watching and tuning itself (owner request Nov 23, 2026).
//  - selfCheck (every hour): finds rides that went wrong, fixes what is safe to fix
//    (a stuck card charge), and leaves one note per problem for the owner.
//  - tunePrices (every Monday): moves the price estimate's road factor toward what real
//    meters say, a little at a time and within limits. The booking screen reads it from
//    publicConfig/pricing. Turn off with pricing.estimate.autoTune = false.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const BRANDING = require("./branding.json");

const db = () => admin.firestore();
const TIME_ZONE = (BRANDING.dispatch && BRANDING.dispatch.timeZone) || "America/New_York";
let libs = null;
const lib = () =>
  (libs ||= Promise.all([import("./lib/selfCheck.mjs"), import("./lib/fareEstimate.mjs"), import("./lib/memberSavings.mjs")]).then(([check, fare, savings]) => ({ check, fare, savings })));

async function runSelfCheck(now = Date.now()) {
  const { check } = await lib();
  const rides = db().collection("rides");
  const [live, unpaid, settling] = await Promise.all([
    rides.where("status", "in", ["pending", "dispatched", "in_transit"]).limit(300).get(),
    rides.where("status", "==", "finished").where("paymentMethod", "==", "card").where("finalFare", "==", null).limit(100).get(),
    rides.where("settlingAt", ">", 0).limit(100).get(),
  ]);
  const seen = new Set();
  const found = [];
  for (const snap of [...live.docs, ...unpaid.docs, ...settling.docs]) {
    if (seen.has(snap.id)) continue;
    seen.add(snap.id);
    const issue = check.rideIssue(snap.data(), now, BRANDING.selfCheck || {});
    if (issue) found.push({ id: snap.id, ride: snap.data(), issue });
  }
  for (const { id, ride, issue } of found) {
    if (issue.fix) await rides.doc(id).update(issue.fix);
    await db()
      .collection("owner_inbox")
      .doc(`health_${id}_${issue.kind}`)
      .set(
        {
          type: "health",
          kind: issue.kind,
          text: check.ISSUE_TEXT[issue.kind] || issue.kind,
          rideId: id,
          carNumber: ride.carNumber || null,
          pickup: ride.pickup || null,
          fixed: !!issue.fix,
          open: !issue.fix,
          at: now,
        },
        { merge: true }
      );
  }
  return { checked: seen.size, issues: found.length };
}

async function runTunePrices(now = Date.now()) {
  const est = BRANDING.estimate || {};
  if (est.autoTune === false) return { skipped: "off" };
  const { check, fare, savings } = await lib();
  const ref = db().collection("publicConfig").doc("pricing");
  const current = Number((await ref.get()).data()?.roadFactor) || Number(est.roadFactor) || 1.35;
  const since = now - 60 * 86400000;
  const snap = await db().collection("rides").where("meterCents", ">", 0).limit(1000).get();
  const samples = snap.docs
    .map((d) => d.data())
    // Only trips that went as booked, from the last 60 days.
    .filter((r) => !savings.tripChanged(r) && Number(r.estMiles) > 0 && (r.droppedOffAt || now) >= since)
    .map((r) => ({ estMiles: r.estMiles, meterCents: r.meterCents, passengers: r.passengers || 1 }));
  const s = fare.suggestRoadFactor(samples, BRANDING.fare, current, check.TUNE_DEFAULTS.minRides);
  const next = check.nextRoadFactor(current, s.factor);
  if (next == null || next === current) return { rides: s.rides, roadFactor: current, changed: false };
  await ref.set({ roadFactor: next, previous: current, basedOnRides: s.rides, medianRatio: s.medianRatio, updatedAt: now }, { merge: true });
  await db()
    .collection("owner_inbox")
    .doc(`pricing_${new Date(now).toISOString().slice(0, 10)}`)
    .set({ type: "pricing", text: `Price estimates adjusted: road factor ${current} -> ${next}, from ${s.rides} real meters.`, at: now, open: false });
  return { rides: s.rides, roadFactor: next, changed: true };
}

exports.selfCheck = onSchedule({ schedule: "every 60 minutes", timeZone: TIME_ZONE }, async () => {
  const r = await runSelfCheck();
  console.log("selfCheck", r);
});
exports.tunePrices = onSchedule({ schedule: "17 3 * * 1", timeZone: TIME_ZONE }, async () => {
  const r = await runTunePrices();
  console.log("tunePrices", r);
});
exports._runSelfCheck = runSelfCheck;
exports._runTunePrices = runTunePrices;
