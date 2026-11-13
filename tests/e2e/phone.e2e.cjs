// Dispatcher Quick Entry on the Firestore emulator.
const assert = require("node:assert/strict");
const ROOT = require("node:path").resolve(__dirname, "../../functions");
const f = require(ROOT + "/index.js");
const E = require(ROOT + "/dispatchEngine.js");
require(ROOT + "/timers.js").impl = async () => {};
require(ROOT + "/push.js").impl = async (t) => ({ responses: t.map(() => ({})) });
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
const ADMIN = { uid: "boss", token: { admin: true } };
const as = (fn, data, auth = ADMIN) => f[fn].run({ data, auth });
const get = async (p) => (await db.doc(p).get()).data();
async function rejects(p, re) { await assert.rejects(p, (e) => (assert.match(e.message, re), true)); }
async function created(rideId) {
  const ref = db.doc(`rides/${rideId}`);
  const data = (await ref.get()).data();
  await f.assignRideZone.run({ data: { data: () => data, ref }, params: { rideId } });
  return get(`rides/${rideId}`);
}

(async () => {
  await require("./reset.cjs")(db);
  E._resetSettingsCache();
  await db.doc("settings/dispatch").set({ mode: "auto" });
  await db.doc("zones/east").set({ label: "East", points: [] });
  await db.doc("zones/fort-benning").set({ label: "Fort Benning", requiresCert: "base", points: [] });
  await db.doc("drivers/d1").set({ carNumber: "44", active: true, status: "offline", certs: {} });
  await db.doc("board/d1").set({ carNumber: "44", status: "ready", zoneId: "east", lineKey: 1 });
  await db.doc("blacklist_phones/7065550199").set({ reason: "test" });

  await rejects(as("dispatcherCreateRide", { phone: "706", pickup: "x" }), /10-digit/);
  await rejects(as("dispatcherCreateRide", { phone: "(706) 555-0100", pickup: "" }), /pickup/);
  await rejects(as("dispatcherCreateRide", { phone: "7065550199", pickup: "x" }), /blocked/);
  await rejects(as("dispatcherCreateRide", { phone: "7065550100", pickup: "x" }, { uid: "d1", token: { driver: true } }), /Dispatcher/);

  // Phone call in East → zone kept, offered to Car 44; caller remembered
  let r = await as("dispatcherCreateRide", { phone: "(706) 555-0100", firstName: "Ms.", lastName: "Annie", pickup: "1200 Wynnton Rd", dropoff: "", zoneId: "east", passengers: 2 });
  let ride = await created(r.rideId);
  assert.deepEqual([ride.source, ride.phone, ride.zoneId, ride.paymentMethod, ride.passengers], ["phone", "7065550100", "east", "cash", 2]);
  assert.equal(ride.offer.driverId, "d1");
  let saved = await get("phoneRiders/7065550100");
  assert.deepEqual([saved.firstName, saved.rideCount, saved.places.map((p) => p.text)], ["Ms.", 1, ["1200 Wynnton Rd"]]);

  // Second call: same pickup bumps its count; Fort Benning zone → base cert required
  r = await as("dispatcherCreateRide", { phone: "7065550100", pickup: "1200 wynnton rd", dropoff: "", zoneId: "fort-benning" });
  ride = await created(r.rideId);
  assert.deepEqual(ride.requiresCerts, ["base"]);
  assert.equal(ride.dispatchState, "broadcast"); // nobody base-certified
  saved = await get("phoneRiders/7065550100");
  assert.deepEqual([saved.rideCount, saved.places[0].count, saved.firstName], [2, 2, "Ms."]);

  // Requested car, scheduled later, don't remember
  await rejects(as("dispatcherCreateRide", { phone: "7065550111", pickup: "x", requestedDriverId: "nope" }), /roster/);
  await rejects(as("dispatcherCreateRide", { phone: "7065550111", pickup: "x", scheduleType: "later", scheduledFor: "" }), /time/);
  r = await as("dispatcherCreateRide", { phone: "7065550111", pickup: "Airport", dropoff: "", zoneId: "east", requestedDriverId: "d1", scheduleType: "later", scheduledFor: "2030-01-01T09:00", remember: false });
  ride = await created(r.rideId);
  assert.deepEqual([ride.requestedDriverId, ride.dispatchState], ["d1", "scheduled"]);
  assert.equal(await get("phoneRiders/7065550111"), undefined);

  await as("forgetCaller", { phone: "7065550100" });
  assert.equal(await get("phoneRiders/7065550100"), undefined);

  console.log("PHONE E2E: all assertions passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
