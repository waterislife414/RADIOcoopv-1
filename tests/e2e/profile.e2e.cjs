// Driver record, score, low-score hold, credit hold and agreement on the Firestore emulator.
const assert = require("node:assert/strict");
const ROOT = require("node:path").resolve(__dirname, "../../functions");
const f = require(ROOT + "/index.js");
const E = require(ROOT + "/dispatchEngine.js");
const L = require(ROOT + "/lease.js")._internal;
require(ROOT + "/timers.js").impl = async () => {};
require(ROOT + "/push.js").impl = async (t) => ({ responses: t.map(() => ({})) });
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
const ADMIN = { uid: "boss", token: { admin: true } };
const drv = (uid) => ({ uid, token: { driver: true } });
const run = (fn, data, auth) => f[fn].run({ data, auth });
const get = async (p) => (await db.doc(p).get()).data();
async function rejects(p, re) { await assert.rejects(p, (e) => (assert.match(e.message, re), true)); }
const DAY = 86400000;

const LEGAL = require("../../functions/branding.json").legalVersion;
(async () => {
  await require("./reset.cjs")(db);
  E._resetSettingsCache();
  const core = await import(ROOT + "/lib/dispatchCore.mjs");
  const now = Date.now();
  await db.doc("settings/dispatch").set({ mode: "auto" });
  await db.doc("zones/east").set({ label: "East", points: [] });
  const mk = async (uid, car, extra = {}) => {
    await db.doc(`drivers/${uid}`).set({ carNumber: car, active: true, status: "offline", certs: {}, warnings: 0, score: 100, leaseCreditCents: 0, leaseOwedCents: 0, approvedAt: now - 100 * DAY, ...extra });
    await db.doc(`board/${uid}`).set({ carNumber: car, status: "ready", zoneId: "east", lineKey: Number(car) });
  };
  await mk("d1", "1", { recentStrikes: [now - 61 * DAY, now - 61 * DAY] }); // two old strikes: aged out
  await mk("d2", "2");
  const ride = (id) => db.doc(`rides/${id}`).set({ status: "pending", zoneId: "east", pickup: "x", customerId: "guest", dispatchState: "new", timestamp: admin.firestore.Timestamp.now() });

  // Agreement + contact
  await rejects(run("acceptDriverAgreement", { version: LEGAL, docs: ["driver-agreement"] }, drv("d1")), /not accepted/);
  await run("acceptDriverAgreement", { version: LEGAL, docs: ["driver-agreement", "privacy"], marketingOptIn: true }, drv("d1"));
  assert.deepEqual([(await get("drivers/d1")).agreement.version, (await get("drivers/d1")).agreement.marketingOptIn], [LEGAL, true]);
  await rejects(run("updateDriverContact", { phone: "123" }, drv("d1")), /10-digit/);
  await run("updateDriverContact", { phone: "(706) 555-0101", address: "1 Example St", emergencyName: "Pat", emergencyPhone: "7065550102" }, drv("d1"));
  assert.equal((await get("drivers/d1")).phone, "7065550101");

  // A missed call: old strikes don't count, so this is warning 1 (not 3), score 90, record entry written
  await ride("r1"); await E.startDispatch("r1");
  assert.equal((await get("rides/r1")).offer.driverId, "d1");
  await run("declineOffer", { rideId: "r1" }, drv("d1"));
  let d1 = await get("drivers/d1");
  assert.deepEqual([d1.warnings, d1.score, d1.recentStrikes.length, d1.status], [1, 90, 1, "offline"]);
  let rec = (await db.collection("drivers/d1/record").get()).docs.map((d) => d.data());
  assert.deepEqual([rec.length, rec[0].type, rec[0].points], [1, "declined", 10]);
  assert.ok(rec[0].expiresAt - rec[0].at === 60 * DAY);

  // Office incidents: accident (-30) -> 60 < 70 -> no app calls for 12 h; he stays on the board but is skipped
  await rejects(run("addDriverIncident", { uid: "d1", type: "accident", note: "x" }, drv("d1")), /Dispatcher/);
  await rejects(run("addDriverIncident", { uid: "d1", type: "accident", note: "" }, ADMIN), /note/);
  const inc = await run("addDriverIncident", { uid: "d1", type: "accident", note: "Backed into a pole at the shop" }, ADMIN);
  assert.equal(inc.score, 60); assert.ok(inc.callHoldUntil > now + 11 * 3600000);
  await db.doc("board/d1").update({ status: "ready", zoneId: "east", lineKey: 0 });
  await db.doc("rides/r1").delete(); // r1 had moved on to d2: put him back in line
  await db.doc("board/d2").update({ status: "ready", offerRideId: null });
  await ride("r2"); await E.startDispatch("r2");
  assert.equal((await get("rides/r2")).offer.driverId, "d2", "held driver is skipped even though he is first in line");
  rec = (await db.collection("drivers/d1/record").get()).docs.map((d) => d.data().type).sort();
  assert.deepEqual(rec, ["accident", "declined"]);

  // Third active warning = write-up + suspended
  await mk("d3", "3", { recentStrikes: [now - 3 * DAY, now - 2 * DAY] });
  await db.doc("board/d2").update({ status: "offline" }); await db.doc("board/d1").update({ status: "offline" });
  await db.doc("rides/r2").delete();
  await ride("r3"); await E.startDispatch("r3");
  await run("declineOffer", { rideId: "r3" }, drv("d3"));
  const d3 = await get("drivers/d3");
  assert.deepEqual([d3.warnings, d3.status, d3.score], [3, "suspended", 70]);
  const types = (await db.collection("drivers/d3/record").get()).docs.map((d) => d.data().type).sort();
  assert.deepEqual(types, ["declined", "write_up"]);

  // Hold credit: needs 60 clean days
  await rejects(run("setLeaseHold", { hold: true }, drv("d1")), /clean record/);
  await mk("d4", "4", { approvedAt: now - 10 * DAY });
  await rejects(run("setLeaseHold", { hold: true }, drv("d4")), /after 60 days/);
  await mk("d5", "5", { leaseCreditCents: 9000 });
  const key = core.leasePeriodKey(now, { timeZone: "America/New_York", lease: { dueStart: "14:00" } });
  await run("setLeaseHold", { hold: true }, drv("d5"));
  await db.doc(`ledger/d5/days/${key}`).set({ periodKey: key, open: true, cardFaresCents: 2000, cardTipsCents: 0 });
  await L.settlePeriod(core, "d5", key, now);
  const d5 = await get("drivers/d5"); const day5 = await get(`ledger/d5/days/${key}`);
  assert.deepEqual([d5.leaseCreditCents, d5.leaseOwedCents, d5.holdCreditPeriod, day5.envelopeDueCents, day5.heldCreditCents], [9000, 5500, null, 5500, 9000]);

  console.log("PROFILE E2E: all assertions passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
