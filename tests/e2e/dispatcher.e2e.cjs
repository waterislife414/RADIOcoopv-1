// Dispatcher overrides on the Firestore emulator.
const assert = require("node:assert/strict");
const ROOT = require("node:path").resolve(__dirname, "../../functions");
const f = require(ROOT + "/index.js");
const E = require(ROOT + "/dispatchEngine.js");
const timers = require(ROOT + "/timers.js");
const push = require(ROOT + "/push.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
timers.impl = async () => {};
push.impl = async (tokens) => ({ responses: tokens.map(() => ({})) });

const ADMIN = { uid: "boss", token: { admin: true } };
const as = (fn, data, auth = ADMIN) => f[fn].run({ data, auth });
const get = async (p) => (await db.doc(p).get()).data();
async function rejects(p, re) { await assert.rejects(p, (e) => (assert.match(e.message, re), true)); }
const sq = (lat, lng, r = 0.01) => [{ lat: lat - r, lng: lng - r }, { lat: lat - r, lng: lng + r }, { lat: lat + r, lng: lng + r }, { lat: lat + r, lng: lng - r }];

(async () => {
  await require("./reset.cjs")(db);
  E._resetSettingsCache();
  await db.doc("zones/rose-hill").set({ label: "Rose Hill", points: sq(32.48, -84.95) });
  await db.doc("zones/east").set({ label: "East", points: sq(32.48, -84.9) });
  await db.doc("zones/fort-benning").set({ label: "Fort Benning", requiresCert: "base", points: sq(32.36, -84.95) });
  const mk = async (uid, car, status, zoneId, lineKey) => {
    await db.doc(`drivers/${uid}`).set({ carNumber: car, status: "offline", active: true, certs: {}, warnings: 0 });
    await db.doc(`board/${uid}`).set({ carNumber: car, status, zoneId, lineKey });
  };
  await mk("d1", "44", "ready", "rose-hill", 1);
  await mk("d2", "12", "ready", "rose-hill", 2);
  const ride = async (id, extra) => db.doc(`rides/${id}`).set({ status: "pending", pickup: "1 A St", dropoff: "B", customerId: "guest", dispatchState: "new", timestamp: admin.firestore.Timestamp.now(), ...extra });

  // Mode: non-admin refused; validation; switching to auto dispatches waiting rides
  await rejects(as("setDispatchMode", { mode: "auto" }, { uid: "d1", token: { driver: true } }), /Dispatcher/);
  await rejects(as("setDispatchMode", { mode: "scheduled", windows: [] }), /time window/);
  await ride("w1", { zoneId: "rose-hill", zoneLabel: "Rose Hill" });
  let res = await as("setDispatchMode", { mode: "auto" });
  assert.equal(res.autoNow, true); assert.equal(res.started, 1);
  assert.equal((await get("rides/w1")).offer.driverId, "d1");
  await as("setDispatchMode", { mode: "scheduled", windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" }] });
  assert.equal((await get("settings/dispatch")).windows.length, 1);

  // Assign by hand while an offer is out: offered driver freed (no penalty), car 12 gets it
  res = await as("dispatcherAssign", { rideId: "w1", uid: "d2" });
  assert.equal(res.carNumber, "12");
  let w1 = await get("rides/w1");
  assert.deepEqual([w1.status, w1.driverId, w1.assignedHow, w1.offer], ["dispatched", "d2", "dispatcher", null]);
  let b1 = await get("board/d1");
  assert.deepEqual([b1.status, b1.lineKey], ["ready", 1]);
  assert.equal((await get("drivers/d1")).warnings, 0);
  assert.equal((await get("board/d2")).status, "on_call");
  assert.equal((await get("driverInbox/d2")).current.rideId, "w1");

  // Reassign a dispatched ride: car 12 freed back to his spot, car 44 gets it
  await as("dispatcherAssign", { rideId: "w1", uid: "d1" });
  assert.equal((await get("rides/w1")).driverId, "d1");
  const b2 = await get("board/d2");
  assert.deepEqual([b2.status, b2.rideId, b2.lastEvent.type], ["ready", null, "ride_cancelled"]);
  assert.equal((await get("driverInbox/d2")).current, null);
  await rejects(as("dispatcherAssign", { rideId: "w1", uid: "d1" }).then(() => { throw new Error("no-op ok"); }), /no-op ok/);

  // Busy car refused; uncertified car needs force
  await ride("w2", { zoneId: "fort-benning", requiresCerts: ["base"], dispatchState: "escalated" });
  await rejects(as("dispatcherAssign", { rideId: "w2", uid: "d1" }), /already has a fare/);
  await rejects(as("dispatcherAssign", { rideId: "w2", uid: "d2" }), /NEEDS_FORCE/);
  await as("dispatcherAssign", { rideId: "w2", uid: "d2", force: true });
  assert.equal((await get("rides/w2")).driverId, "d2");

  // Dispatch without a car (old way)
  await db.doc("settings/dispatch").set({ mode: "manual" }); E._resetSettingsCache();
  await ride("w3", { zoneId: "east" });
  await as("dispatcherAssign", { rideId: "w3" });
  const w3 = await get("rides/w3");
  assert.deepEqual([w3.status, w3.dispatchState, w3.driverId ?? null], ["dispatched", "manual", null]);

  // Radio car: add, duplicate refused, assign, drop off for him at front of East, remove
  await rejects(as("addRadioCar", { carNumber: "44", zoneId: "east" }), /already on the board/);
  res = await as("addRadioCar", { carNumber: "9", zoneId: "east" });
  assert.equal(res.uid, "radio-9");
  await ride("w4", { zoneId: "east" });
  await as("dispatcherAssign", { rideId: "w4", uid: "radio-9" });
  assert.equal((await get("board/radio-9")).status, "on_call");
  await mk("d3", "5", "ready", "east", 100);
  await as("dispatcherBoardAction", { uid: "radio-9", action: "front", zoneId: "east" });
  const r9 = await get("board/radio-9");
  assert.equal(r9.status, "ready"); assert.ok(r9.lineKey < 100);
  assert.equal((await get("rides/w4")).status, "finished");
  await rejects(as("dispatcherBoardAction", { uid: "d3", action: "remove" }), /Only radio cars/);
  await as("dispatcherBoardAction", { uid: "radio-9", action: "remove" });
  assert.equal(await get("board/radio-9"), undefined);

  // Board moves on app drivers; offered car can't be moved
  await as("dispatcherBoardAction", { uid: "d3", action: "moving" });
  assert.equal((await get("board/d3")).status, "moving");
  await as("dispatcherBoardAction", { uid: "d3", action: "ready", zoneId: "rose-hill" });
  assert.equal((await get("board/d3")).zoneId, "rose-hill");
  await db.doc("board/d3").update({ status: "offered" });
  await rejects(as("dispatcherBoardAction", { uid: "d3", action: "off" }), /being offered/);
  await db.doc("board/d3").update({ status: "ready" });

  // Re-zone an unzoned ride; auto picks it up
  await db.doc("settings/dispatch").set({ mode: "auto" }); E._resetSettingsCache();
  await ride("w5", { zoneId: null, dispatchState: "escalated" });
  await as("dispatcherSetRideZone", { rideId: "w5", zoneId: "rose-hill" });
  const w5 = await get("rides/w5");
  assert.equal(w5.zoneLabel, "Rose Hill"); assert.equal(w5.dispatchState, "offering"); assert.equal(w5.offer.driverId, "d3");

  console.log("DISPATCHER E2E: all assertions passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
