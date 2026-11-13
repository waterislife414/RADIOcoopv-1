// Auto-dispatch end to end on the Firestore emulator. Cloud Tasks timers and
// push are captured instead of sent; triggers are invoked with fake events.
const assert = require("node:assert/strict");
const ROOT = require("node:path").resolve(__dirname, "../../functions");
const f = require(ROOT + "/index.js");
const E = require(ROOT + "/dispatchEngine.js");
const timers = require(ROOT + "/timers.js");
const push = require(ROOT + "/push.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();

const queued = [];
const pushes = [];
timers.impl = async (data, delay) => queued.push({ ...data, delay });
push.impl = async (tokens, msg) => {
  pushes.push({ tokens, title: msg.webpush.notification.title });
  return { responses: tokens.map(() => ({ success: true })) };
};

const sq = (lat, lng, r = 0.01) => [
  { lat: lat - r, lng: lng - r }, { lat: lat - r, lng: lng + r },
  { lat: lat + r, lng: lng + r }, { lat: lat + r, lng: lng - r },
];
const RH = { lat: 32.48, lng: -84.95 }, EAST = { lat: 32.48, lng: -84.9 }, FB = { lat: 32.36, lng: -84.95 };
const as = (uid) => ({ uid, token: { driver: true } });
const call = (fn, uid, data) => f[fn].run({ data, auth: as(uid) });
const get = async (p) => (await db.doc(p).get()).data();
const ride = (id) => get(`rides/${id}`);
const board = (uid) => get(`board/${uid}`);
const inbox = async (uid) => (await get(`driverInbox/${uid}`)) || {};
async function rejects(p, re) { await assert.rejects(p, (e) => (assert.match(e.message, re), true)); }
async function runTimer(match) {
  const i = queued.findIndex(match);
  assert.ok(i >= 0, "timer queued: " + JSON.stringify(queued));
  const [t] = queued.splice(i, 1);
  await f.dispatchTimer.run({ data: t });
  return t;
}
async function newRide(id, extra) {
  const data = { status: "pending", pickup: "100 Test St", dropoff: "", customerId: "guest", firstName: "Pat", phone: "7065550100", paymentMethod: "cash", timestamp: admin.firestore.Timestamp.now(), ...extra };
  await db.doc(`rides/${id}`).set(data);
  // assignRideZone with a preset zone (no geocoding)
  await f.assignRideZone.run({ data: { data: () => data, ref: db.doc(`rides/${id}`) }, params: { rideId: id } });
}
async function boardChanged(uid, before) {
  const after = await board(uid);
  await f.onDriverAvailable.run({ data: { before: { data: () => before }, after: { data: () => after } }, params: { uid } });
}

(async () => {
  await require("./reset.cjs")(db);
  await db.doc("settings/dispatch").set({ mode: "auto" });
  await db.doc("zones/rose-hill").set({ label: "Rose Hill", order: 1, points: sq(RH.lat, RH.lng) });
  await db.doc("zones/east").set({ label: "East", order: 2, points: sq(EAST.lat, EAST.lng) });
  await db.doc("zones/fort-benning").set({ label: "Fort Benning", order: 3, requiresCert: "base", points: sq(FB.lat, FB.lng) });
  const mk = async (uid, car, status, zoneId, lineKey, extra = {}) => {
    await db.doc(`drivers/${uid}`).set({ carNumber: car, status: "offline", active: true, certs: {}, warnings: 0, ...extra });
    await db.doc(`board/${uid}`).set({ carNumber: car, status, zoneId, lineKey });
  };
  await mk("d1", "44", "ready", "rose-hill", 1);
  await mk("d2", "12", "ready", "rose-hill", 2);
  await mk("d3", "7", "moving", null, null);
  await db.doc("driverTokens/d1").set({ tokens: ["tok-d1-xxxxxxxxxxxxxxxxxxxx"] });

  // 1. New ride in Rose Hill → offered to first in line (d1), push + 15 s timer
  await newRide("r1", { zoneId: "rose-hill", zoneLabel: "Rose Hill" });
  let r = await ride("r1");
  assert.equal(r.dispatchState, "offering"); assert.equal(r.offer.driverId, "d1"); assert.equal(r.offer.kind, "zone");
  assert.equal((await board("d1")).status, "offered");
  assert.equal((await inbox("d1")).offer.rideId, "r1");
  assert.equal(pushes.at(-1).title, "\u{1F4DE} Call in Rose Hill");
  assert.equal(queued.at(-1).delay, 15);

  // 2. Pings 2 and 3, then expiry → d1 off the board with a warning, d2 offered
  await runTimer((t) => t.rideId === "r1" && t.step === 2);
  assert.equal((await ride("r1")).offer.pings, 2);
  assert.equal((await inbox("d1")).offer.pings, 2);
  await runTimer((t) => t.rideId === "r1" && t.step === 3);
  await runTimer((t) => t.rideId === "r1" && t.step === 4);
  let b1 = await board("d1");
  assert.equal(b1.status, "offline"); assert.equal(b1.lastEvent.type, "missed_call"); assert.equal(b1.lineKey, null);
  assert.equal((await get("drivers/d1")).warnings, 1);
  assert.equal((await inbox("d1")).offer, null);
  r = await ride("r1");
  assert.equal(r.offer.driverId, "d2"); assert.equal(r.offer.seq, 2); assert.deepEqual(r.triedDriverIds, ["d1"]);
  await f.dispatchTimer.run({ data: { type: "offer", rideId: "r1", seq: 1, step: 2 } }); // stale timer: no-op
  assert.equal((await ride("r1")).offer.driverId, "d2");

  // 3. d2 declines → penalty; nobody left in Rose Hill → broadcast to d3 (moving)
  await rejects(call("declineOffer", "d1", { rideId: "r1" }), /no longer yours/);
  const dec = await call("declineOffer", "d2", { rideId: "r1" });
  assert.equal(dec.penalized, true);
  assert.equal((await board("d2")).lastEvent.type, "declined");
  r = await ride("r1");
  assert.equal(r.dispatchState, "broadcast"); assert.deepEqual(r.broadcastTo, ["d3"]);
  assert.equal((await inbox("d3")).broadcasts.r1.zoneLabel, "Rose Hill");
  assert.ok(queued.some((t) => t.type === "escalate" && t.rideId === "r1" && t.delay === 90));

  // 4. First tap wins
  await rejects(call("claimBroadcast", "d2", { rideId: "r1" }), /Another car/);
  await call("claimBroadcast", "d3", { rideId: "r1" });
  r = await ride("r1");
  assert.deepEqual([r.status, r.driverId, r.carNumber, r.dispatchState, r.assignedHow], ["dispatched", "d3", "7", "assigned", "broadcast"]);
  let b3 = await board("d3");
  assert.deepEqual([b3.status, b3.zoneId, b3.rideId], ["on_call", "rose-hill", "r1"]);
  let i3 = await inbox("d3");
  assert.equal(i3.broadcasts.r1, undefined);
  assert.deepEqual([i3.current.rideId, i3.current.riderName, i3.current.riderPhone], ["r1", "Pat", "7065550100"]);
  await runTimer((t) => t.type === "escalate" && t.rideId === "r1"); // already assigned: no-op
  assert.equal((await ride("r1")).dispatchState, "assigned");

  // 5. Picked up → in transit; drop off in East → ride finished, d3 next up in East
  await rejects(call("driverPickedUp", "d2", { rideId: "r1" }), /isn't your call/);
  await call("driverPickedUp", "d3", { rideId: "r1" });
  assert.equal((await ride("r1")).status, "in_transit");
  assert.equal((await inbox("d3")).current.status, "in_transit");
  const drop = await call("driverDropOff", "d3", EAST);
  assert.deepEqual([drop.status, drop.zoneId], ["ready", "east"]);
  assert.equal((await ride("r1")).status, "finished");
  assert.equal((await inbox("d3")).current, null);

  // 6. Requested driver: declining costs nothing; then broadcast has nobody → escalate
  await newRide("r2", { zoneId: "rose-hill", zoneLabel: "Rose Hill", requestedDriverId: "d3" });
  r = await ride("r2");
  assert.deepEqual([r.offer.driverId, r.offer.kind], ["d3", "requested"]);
  const before3 = await board("d3");
  const dec2 = await call("declineOffer", "d3", { rideId: "r2" });
  assert.equal(dec2.penalized, false);
  b3 = await board("d3");
  assert.deepEqual([b3.status, b3.zoneId, b3.lineKey], ["ready", "east", before3.lineKey]);
  assert.equal((await get("drivers/d3")).warnings, 0);
  r = await ride("r2");
  assert.equal(r.dispatchState, "broadcast"); assert.deepEqual(r.broadcastTo, []);
  await runTimer((t) => t.type === "escalate" && t.rideId === "r2");
  assert.equal((await ride("r2")).dispatchState, "escalated");

  // 7. A driver checks ready in Rose Hill → the waiting call is offered to him
  const pre1 = await board("d1");
  await call("driverGoOnline", "d1", RH);
  await call("driverCheckReady", "d1", RH);
  await boardChanged("d1", pre1);
  r = await ride("r2");
  assert.deepEqual([r.dispatchState, r.offer.driverId], ["offering", "d1"]);

  // 8. Third strike: d1 at 2 warnings misses → suspended
  await db.doc("drivers/d1").update({ warnings: 2 });
  for (const s of [2, 3, 4]) await runTimer((t) => t.rideId === "r2" && t.step === s && t.seq === r.offer.seq);
  assert.equal((await get("drivers/d1")).status, "suspended");
  assert.equal((await board("d1")).lastEvent.suspended, true);
  await rejects(call("driverGoOnline", "d1", RH), /suspended/);

  // 9. Dispatcher dismisses a ride on offer → driver goes back to his spot, no penalty
  await mk("d4", "21", "ready", "east", 5);
  await newRide("r3", { zoneId: "east", zoneLabel: "East" });
  r = await ride("r3");
  const offeredTo = r.offer.driverId;
  const spot = (await board(offeredTo)).lineKey;
  await db.doc("rides/r3").delete();
  await f.onRideDeleted.run({ data: { data: () => r }, params: { rideId: "r3" } });
  const bo = await board(offeredTo);
  assert.deepEqual([bo.status, bo.lineKey, bo.offerRideId], ["ready", spot, null]);
  assert.equal((await inbox(offeredTo)).offer, null);

  // 10. Fort Benning ride: only base-certified drivers
  await newRide("r4", { zoneId: "fort-benning", zoneLabel: "Fort Benning" });
  r = await ride("r4");
  assert.equal(r.dispatchState, "broadcast"); assert.deepEqual(r.broadcastTo, []);
  await db.doc("drivers/d4").update({ "certs.base": { status: "approved", expiresAt: Date.now() + 864e5 } });
  const pre4 = { ...(await board("d4")), status: "offline" };
  await boardChanged("d4", pre4);
  r = await ride("r4");
  assert.deepEqual(r.broadcastTo, ["d4"]);
  await rejects(call("claimBroadcast", "d3", { rideId: "r4" }), /Another car/);
  await call("claimBroadcast", "d4", { rideId: "r4" });
  assert.equal((await ride("r4")).driverId, "d4");

  // 11. Wheelchair: needs cert + a van
  await mk("d5", "30", "ready", "east", 9, { certs: { wheelchair: { status: "approved" } } });
  await newRide("r5", { zoneId: "east", zoneLabel: "East", needsAccessibleVehicle: true });
  assert.equal((await ride("r5")).dispatchState, "broadcast"); // d5 has the cert but no van on file
  await db.doc("rides/r5").delete();
  await db.doc("vehicles/30").set({ carNumber: "30", isVan: true, active: true });
  await newRide("r6", { zoneId: "east", zoneLabel: "East", needsAccessibleVehicle: true });
  assert.equal((await ride("r6")).offer.driverId, "d5");

  // 12. Sweep catches an offer whose timer was lost
  await db.doc("rides/r6").update({ "offer.startedAt": Date.now() - 2 * 60_000 });
  await f.dispatchSweep.run({});
  r = await ride("r6");
  assert.deepEqual(r.triedDriverIds, ["d5"]);
  assert.equal((await get("drivers/d5")).warnings, 1);

  // 13. Manual mode: nothing moves. Scheduled ride waits until 15 min before pickup.
  await db.doc("settings/dispatch").set({ mode: "manual" });
  E._resetSettingsCache();
  await mk("d6", "50", "ready", "east", 1);
  await newRide("r7", { zoneId: "east", zoneLabel: "East" });
  assert.equal((await ride("r7")).dispatchState, "new");
  const later = new Date(Date.now() + 3 * 3600e3).toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16).replace(" ", "T");
  await newRide("r8", { zoneId: "east", scheduleType: "later", scheduledFor: later });
  r = await ride("r8");
  assert.equal(r.dispatchState, "scheduled");
  assert.ok(Math.abs(r.dispatchAt - (Date.now() + 3 * 3600e3 - 15 * 60e3)) < 90_000);
  await db.doc("settings/dispatch").set({ mode: "auto" });
  E._resetSettingsCache();
  await f.dispatchSweep.run({}); // picks up r7 (came in while manual), leaves r8
  assert.equal((await ride("r7")).dispatchState, "offering");
  assert.equal((await ride("r8")).dispatchState, "scheduled");

  console.log("DISPATCH E2E: all assertions passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
