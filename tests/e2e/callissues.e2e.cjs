// Driver SOS and "can't finish this call", on the emulator.
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../functions");
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_stand_in";
const stripePath = require.resolve(ROOT + "/node_modules/stripe");
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: require("../../src/demo/shims/stripe-server.cjs") };
const f = require(ROOT + "/index.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();

const D1 = { uid: "d1", token: { driver: true } };
const ADMIN = { uid: "boss", token: { admin: true } };
const LOC = { lat: 32.47, lng: -84.98 };
const call = (fn, data, auth) => f[fn].run({ data, auth });
const get = async (p) => (await db.doc(p).get()).data();
async function rejects(p, re) {
  await assert.rejects(p, (e) => (assert.match(e.message, re), true));
}
async function onCall(rideId, status) {
  await db.doc(`rides/${rideId}`).set({ customerId: "rider1", status, driverId: "d1", carNumber: "44", paymentMethod: "card", paymentIntentId: `pi_${rideId}`, pickup: "900 Broadway", pickupLat: LOC.lat, pickupLng: LOC.lng });
  await db.doc("board/d1").set({ carNumber: "44", status: "on_call", rideId, zoneId: null, lineKey: null }, { merge: true });
  await db.doc("driverInbox/d1").set({ current: { rideId, status } });
}

(async () => {
  await require("./reset.cjs")(db);
  await db.doc("drivers/d1").set({ carNumber: "44", name: "Pat Example", active: true, certs: {}, recentStrikes: [], penalties: [] });

  // SOS reaches the office; only the office can clear it.
  const sos = await call("driverEmergency", { ...LOC, called911: true }, D1);
  const alert = await get(`alerts/${sos.id}`);
  assert.equal(alert.type, "emergency");
  assert.match(alert.label, /911/);
  assert.deepEqual([alert.carNumber, alert.lat, alert.status], ["44", 32.47, "open"]);
  await rejects(call("ackAlert", { id: sos.id }, D1), /Dispatchers only/);
  await call("ackAlert", { id: sos.id }, ADMIN);
  assert.equal((await get(`alerts/${sos.id}`)).status, "handled");
  await rejects(call("driverEmergency", {}, { uid: "r1", token: {} }), /approved driver/);

  // App rider no-show: only after "I'm here" and 7 minutes at the pickup; the
  // $10 no-show fee comes off the card hold and goes to the driver. No warning.
  await onCall("r1", "dispatched");
  await rejects(call("driverEndCall", { rideId: "r1", reason: "no_show", note: "" }, D1), /few words/);
  await rejects(call("driverEndCall", { rideId: "r1", reason: "runner", note: "ran" }, D1), /doesn't fit/);
  const noShow = { rideId: "r1", reason: "no_show", note: "Waited 10 min, no answer", ...LOC };
  await rejects(call("driverEndCall", noShow, D1), /I'm here/);
  await call("driverArrived", { rideId: "r1", ...LOC }, D1);
  await rejects(call("driverEndCall", noShow, D1), /7 minutes/);
  await db.doc("rides/r1").update({ arrivedAt: Date.now() - 8 * 60000 });
  const ended = await call("driverEndCall", noShow, D1);
  assert.equal(ended.outcome, "cancel");
  assert.deepEqual([ended.fee.cents, ended.fee.chargedCents, ended.fee.status], [1000, 1000, "charged"]);
  let ride = await get("rides/r1");
  assert.deepEqual([ride.status, ride.cancelledBy, ride.endReport.reason, ride.fee.kind], ["cancelled", "driver", "no_show", "no_show_fee"]);
  assert.equal((await get("drivers/d1")).leaseCreditCents, 1000);
  assert.match((await get("driverInbox/d1")).notice.text, /\$10\.00 goes to your lease credit/);
  assert.equal((await get("board/d1")).status, "moving");
  assert.equal((await get("driverInbox/d1")).current, null);
  assert.equal((await get("drivers/d1")).warnings ?? 0, 0);

  // Not his call anymore.
  await rejects(call("driverEndCall", { rideId: "r1", reason: "other", note: "x x x" }, D1), /isn't your call/);

  // Rider ran off: ride ends unpaid, office alerted.
  await onCall("r2", "in_transit");
  assert.equal((await call("driverEndCall", { rideId: "r2", reason: "runner", note: "Jumped out at the light", ...LOC }, D1)).outcome, "finish");
  ride = await get("rides/r2");
  assert.deepEqual([ride.status, ride.unpaid], ["finished", true]);

  // Flat tire with the rider in the car: office sends a car to them; shop gets an urgent work order; driver offline.
  await onCall("r3", "in_transit");
  assert.equal((await call("driverEndCall", { rideId: "r3", reason: "flat_tire", note: "Front right tire blew", ...LOC }, D1)).outcome, "office");
  ride = await get("rides/r3");
  assert.deepEqual([ride.status, ride.dispatchState, ride.driverId, ride.pickupLat], ["pending", "escalated", null, 32.47]);
  assert.match(ride.pickupNote, /car 44/);
  assert.equal((await get("board/d1")).status, "offline");
  const wo = (await db.collection("work_orders").where("carNumber", "==", "44").get()).docs.map((d) => d.data());
  assert.equal(wo.length, 1);
  assert.deepEqual([wo[0].item, wo[0].urgency], ["Tires", "now"]);
  assert.equal((await get("vehicles/44")).openRepairs, 1);
  const open = (await db.collection("alerts").where("status", "==", "open").get()).docs.map((d) => d.data().type).sort();
  assert.deepEqual(open, ["call_ended", "send_car"], "runner + flat tire (no-show doesn't alert)");

  // Out of gas before pickup: another driver gets the call, 2 warnings, off the board.
  await onCall("r4", "dispatched");
  const gas = await call("driverEndCall", { rideId: "r4", reason: "out_of_gas", note: "Tank empty on Victory Dr", ...LOC }, D1);
  assert.deepEqual([gas.outcome, gas.warnings, gas.suspended], ["redispatch", 2, false]);
  ride = await get("rides/r4");
  assert.deepEqual([ride.status, ride.driverId, ride.triedDriverIds], ["pending", null, ["d1"]]);
  let d1 = await get("drivers/d1");
  assert.equal(d1.warnings, 2);
  assert.equal(d1.recentStrikes.length, 2);
  const rec = (await db.collection("drivers/d1/record").get()).docs.map((d) => d.data());
  assert.equal(rec.find((r) => r.reason === "out_of_gas").warnings, 2);

  // Again: 4 warnings, suspended with a write-up.
  await onCall("r5", "dispatched");
  const gas2 = await call("driverEndCall", { rideId: "r5", reason: "out_of_gas", note: "Empty again", ...LOC }, D1);
  assert.deepEqual([gas2.warnings, gas2.suspended], [4, true]);
  d1 = await get("drivers/d1");
  assert.equal(d1.status, "suspended");
  assert.ok((await db.collection("drivers/d1/record").where("type", "==", "write_up").get()).size >= 1);

  console.log("callissues e2e: ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
