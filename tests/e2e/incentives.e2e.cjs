// Strikes, score and clean-period bonus on the Firestore emulator.
const assert = require("node:assert/strict");
const ROOT = require("node:path").resolve(__dirname, "../../functions");
const f = require(ROOT + "/index.js");
const E = require(ROOT + "/dispatchEngine.js");
const I = require(ROOT + "/incentives.js")._internal;
require(ROOT + "/timers.js").impl = async () => {};
require(ROOT + "/push.js").impl = async (t) => ({ responses: t.map(() => ({})) });
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
const get = async (p) => (await db.doc(p).get()).data();
const at = (iso) => Date.parse(iso);

(async () => {
  await require("./reset.cjs")(db);
  E._resetSettingsCache();
  await db.doc("settings/dispatch").set({ mode: "auto" });
  await db.doc("zones/east").set({ label: "East", points: [] });
  const mk = async (uid, car, extra = {}) => {
    await db.doc(`drivers/${uid}`).set({ carNumber: car, active: true, status: "offline", warnings: 0, score: 100, leaseCreditCents: 0, ...extra });
    await db.doc(`board/${uid}`).set({ carNumber: car, status: "ready", zoneId: "east", lineKey: 1 });
  };

  // A declined zone call is a strike: score 90; a requested decline isn't
  await mk("d1", "44");
  await db.doc("rides/r1").set({ status: "pending", zoneId: "east", pickup: "x", customerId: "guest", dispatchState: "new", timestamp: admin.firestore.Timestamp.now() });
  await E.startDispatch("r1");
  await f.declineOffer.run({ data: { rideId: "r1" }, auth: { uid: "d1", token: { driver: true } } });
  let d1 = await get("drivers/d1");
  assert.deepEqual([d1.score, d1.recentStrikes.length, d1.warnings], [90, 1, 1]);
  await db.doc("board/d1").update({ status: "ready", zoneId: "east", lineKey: 2 });
  await db.doc("rides/r2").set({ status: "pending", zoneId: "east", pickup: "x", customerId: "guest", dispatchState: "new", requestedDriverId: "d1", timestamp: admin.firestore.Timestamp.now() });
  await E.startDispatch("r2");
  await f.declineOffer.run({ data: { rideId: "r2" }, auth: { uid: "d1", token: { driver: true } } });
  assert.equal((await get("drivers/d1")).recentStrikes.length, 1);

  // Period Nov 2–15 ends; run on Nov 16: clean + 6 days worked → $5; 2 strikes → none; 3 days → none
  const worked = async (uid, n) => {
    for (let i = 0; i < n; i++) await db.doc(`ledger/${uid}/days/2026-11-0${3 + i}`).set({ periodKey: `2026-11-0${3 + i}`, workedAt: 1 });
  };
  await mk("a", "1", { leaseCreditCents: 1000 });
  await mk("b", "2", { recentStrikes: [at("2026-11-05T15:00:00Z"), at("2026-11-09T15:00:00Z")] });
  await mk("cc", "3");
  await worked("a", 6); await worked("b", 6); await worked("cc", 3);
  const run = at("2026-11-16T11:00:00Z"); // 6 AM ET Monday
  await I.runIncentives(run);
  await I.runIncentives(run); // idempotent
  const a = await get("drivers/a");
  assert.deepEqual([a.leaseCreditCents, a.lastBonus.award], [1500, true]);
  assert.deepEqual([(await get("drivers/b")).lastBonus.reason, (await get("drivers/cc")).lastBonus.reason], ["strikes", "not_enough_days"]);
  assert.equal((await get("ledger/a/entries/bonus_2026-11-02")).cents, 500);
  // Mid-period: no awards; strikes older than 60 days age out of the score
  await mk("old", "4", { score: 90, recentStrikes: [at("2026-09-01T12:00:00Z")] });
  await I.runIncentives(at("2026-11-20T11:00:00Z"));
  const o = await get("drivers/old");
  assert.deepEqual([o.score, o.recentStrikes.length, o.lastBonus], [100, 0, undefined]);

  console.log("INCENTIVES E2E: all assertions passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
