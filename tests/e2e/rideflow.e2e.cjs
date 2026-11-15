// Pickup flow on the emulator: perks, call-in routing, place in line, the
// Day Pass, the 4-minute alert, cancel and no-show fees, rider location,
// and private calls.
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../functions");
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_stand_in";
const stripePath = require.resolve(ROOT + "/node_modules/stripe");
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: require("../../src/demo/shims/stripe-server.cjs") };
const f = require(ROOT + "/index.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
const LEGAL = require(ROOT + "/branding.json").legalVersion;

const MIN = 60_000;
const ADMIN = { uid: "boss", token: { admin: true } };
const D1 = { uid: "d1", token: { driver: true } };
const rider = (uid) => ({ uid, token: {} });
const PICKUP = { lat: 32.47, lng: -84.98 };
const FAR = { lat: 32.52, lng: -84.98 }; // ~5.5 km north
const NEAR = { lat: 32.475, lng: -84.98 }; // ~550 m
const call = (fn, data, auth) => f[fn].run({ data, auth });
const get = async (p) => (await db.doc(p).get()).data();
async function rejects(p, re) {
  await assert.rejects(p, (e) => (assert.match(e.message, re), true));
}
const consent = { version: LEGAL, docs: ["terms", "privacy"] };

async function book(id, extra = {}) {
  const data = {
    status: "pending",
    pickup: "900 Broadway",
    pickupLat: PICKUP.lat,
    pickupLng: PICKUP.lng,
    dropoff: "Peachtree Mall",
    customerId: "u1",
    phone: "7065550142",
    paymentMethod: "card",
    paymentIntentId: `pi_hold_${id}`,
    consent,
    zoneId: "downtown",
    timestamp: admin.firestore.Timestamp.now(),
    ...extra,
  };
  await db.doc(`rides/${id}`).set(data);
  await f.assignRideZone.run({ data: { data: () => data, ref: db.doc(`rides/${id}`) }, params: { rideId: id } });
  return get(`rides/${id}`);
}
async function assign(id) {
  await call("dispatcherAssign", { rideId: id, uid: "d1", force: true }, ADMIN);
  return get(`rides/${id}`);
}
async function freeDriver() {
  await db.doc("board/d1").set({ carNumber: "44", status: "ready", zoneId: "downtown", lineKey: 1, rideId: null }, { merge: true });
}

(async () => {
  await require("./reset.cjs")(db);
  await db.doc("settings/dispatch").set({ mode: "manual" });
  const s = 0.05;
  await db.doc("zones/downtown").set({
    label: "Downtown",
    order: 1,
    points: [
      { lat: PICKUP.lat - s, lng: PICKUP.lng - s },
      { lat: PICKUP.lat - s, lng: PICKUP.lng + s },
      { lat: PICKUP.lat + s, lng: PICKUP.lng + s },
      { lat: PICKUP.lat + s, lng: PICKUP.lng - s },
    ],
  });
  await db.doc("zones/north").set({
    label: "North Highland",
    order: 2,
    points: [
      { lat: 32.6, lng: -85.0 },
      { lat: 32.6, lng: -84.9 },
      { lat: 32.7, lng: -84.9 },
      { lat: 32.7, lng: -85.0 },
    ],
  });
  await db.doc("drivers/d1").set({
    carNumber: "44",
    name: "Pat Example",
    phone: "7065550144",
    status: "offline",
    active: true,
    certs: {},
    warnings: 0,
    agreement: { version: LEGAL, docs: ["driver-agreement", "privacy"] },
    inspection: { carNumber: "44", initialAt: Date.now(), lastFullAt: Date.now(), shiftCheckAt: Date.now() },
  });
  await freeDriver();
  for (const [uid, tier] of [["u1", null], ["u2", "BASIC"], ["u3", "PREMIUM"]]) {
    await db.doc(`users/${uid}`).set({ firstName: uid, phone: "7065550142", idVerified: true, ...(tier ? { subscriptionTier: tier } : {}) });
  }

  // Perks: Basic sees the map, Premium also calls the driver; nobody else gets either.
  assert.deepEqual((await book("p1")).perks, { liveMap: false, callDriver: false });
  assert.deepEqual((await book("p2", { customerId: "u2" })).perks, { liveMap: true, callDriver: false });
  const p3 = await book("p3", { customerId: "u3" });
  assert.deepEqual([p3.perks, p3.priority], [{ liveMap: true, callDriver: true }, "premium"]);

  // The app runs a ride on its own only for a signed-in, ID-verified rider
  // sharing GPS and paying by card/balance. Everyone else goes to the dispatcher.
  assert.equal((await get("rides/p1")).appHandled, true);
  const c1 = await book("c1", { callIn: true });
  assert.deepEqual([c1.dispatchState, c1.appHandled, c1.officeWhy], ["office", false, ["location"]]);
  const nt = await book("c2", { consent: null });
  assert.deepEqual([nt.dispatchState, nt.termsMissing, nt.officeWhy], ["office", true, ["terms"]]);
  await db.doc("users/u9").set({ firstName: "New", idVerified: false });
  assert.deepEqual((await book("c4", { customerId: "u9" })).officeWhy, ["id"]);
  assert.deepEqual((await book("c5", { paymentMethod: "cash", paymentIntentId: null })).officeWhy, ["cash"]);
  for (const id of ["c4", "c5"]) await db.doc(`rides/${id}`).delete();

  // Place in line: Premium first, then by booking time. Guests can ask with their ride id.
  for (const id of ["p2", "c1", "c2"]) await db.doc(`rides/${id}`).delete();
  const g1 = await book("g1", { customerId: "guest", paymentMethod: "cash", paymentIntentId: null });
  assert.deepEqual([g1.dispatchState, g1.officeWhy], ["office", ["guest", "cash"]]);
  assert.equal((await call("queueStatus", { rideId: "p3" }, rider("u3"))).position, 1);
  const q1 = await call("queueStatus", { rideId: "p1" }, rider("u1"));
  assert.deepEqual([q1.waiting, q1.position, q1.hasPriority], [true, 2, false]);
  assert.equal((await call("queueStatus", { rideId: "g1" }, undefined)).position, 3);
  await rejects(call("queueStatus", { rideId: "p1" }, rider("u2")), /not found/);

  // Day Pass on a waiting ride: moves ahead of regular riders (still behind Premium),
  // switches on the map and calling, and is good for the rest of the day.
  const pass = await call("payFastPass", { paymentMethodId: "pm_card" }, rider("u1"));
  assert.equal(pass.status, "succeeded");
  const dayPass = (await get("users/u1")).dayPass;
  assert.ok(dayPass.id === pass.id && dayPass.expiresAt > Date.now() && dayPass.expiresAt - Date.now() <= 24 * 60 * MIN + MIN);
  await rejects(call("applyDayPass", { rideId: "g1", passId: pass.id }, undefined), /isn't valid/);
  await call("applyDayPass", { rideId: "p1", passId: pass.id }, rider("u1"));
  let ride = await get("rides/p1");
  assert.deepEqual([ride.priority, ride.perks, ride.fastPassId], ["vip", { liveMap: true, callDriver: true }, pass.id]);
  assert.equal((await call("queueStatus", { rideId: "p1" }, rider("u1"))).position, 2);
  assert.equal((await call("queueStatus", { rideId: "g1" }, undefined)).position, 3);
  const later = await book("p4", { fastPassId: pass.id, wantsPriorityPass: true });
  assert.deepEqual([later.priority, later.perks.callDriver], ["vip", true], "same pass, second ride today");
  for (const id of ["p3", "g1", "p4"]) await db.doc(`rides/${id}`).delete();

  // Driver on the way: ETA on every ping, the 4-minute alert once he's close, the car on the rider's map.
  ride = await assign("p1");
  assert.deepEqual([ride.status, ride.driverId], ["dispatched", "d1"]);
  assert.equal((await get("driverInbox/d1")).current.appRide, true);
  await call("driverPing", FAR, D1);
  ride = await get("rides/p1");
  assert.ok(ride.eta.minutes > 4 && ride.headsUpAt == null, `eta ${ride.eta.minutes}`);
  assert.deepEqual([ride.driverPos.lat, ride.driverPos.lng], [FAR.lat, FAR.lng]);
  // Before the alert, cancelling is free...
  assert.equal((await import("../../functions/lib/rideTiming.mjs")).cancelQuote(ride, Date.now()).feeCents, 0);
  await call("driverPing", NEAR, D1);
  ride = await get("rides/p1");
  assert.ok(ride.eta.minutes <= 4 && ride.headsUpAt > 0);
  // ...after it, $5: asked first, then charged from the card hold and credited to the driver.
  await db.doc("rides/p1").update({ assignedAt: Date.now() - 5 * MIN, headsUpAt: Date.now() - 2 * MIN });
  await rejects(call("cancelMyRide", { rideId: "p1" }, rider("u1")), /costs \$5\.00/);
  const cancelled = await call("cancelMyRide", { rideId: "p1", acceptFeeCents: 500 }, rider("u1"));
  assert.equal(cancelled.feeCents, 500);
  ride = await get("rides/p1");
  assert.deepEqual([ride.status, ride.cancelledBy, ride.fee.kind, ride.fee.chargedCents], ["cancelled", "rider", "late_cancel_fee", 500]);
  assert.equal((await get("board/d1")).status, "moving");
  assert.deepEqual([(await get("driverInbox/d1")).current, (await get("drivers/d1")).leaseCreditCents], [null, 500]);
  assert.match((await get("driverInbox/d1")).notice.text, /\$5\.00 cancel fee/);

  // An account-balance rider (no card hold) who cancels late owes the fee; it rides along on their next card checkout.
  await freeDriver();
  await book("p5", { paymentMethod: "wallet", paymentIntentId: null });
  await assign("p5");
  await db.doc("rides/p5").update({ assignedAt: Date.now() - 5 * MIN, headsUpAt: Date.now() - MIN });
  await call("cancelMyRide", { rideId: "p5", acceptFeeCents: 500 }, rider("u1"));
  assert.equal((await get("users/u1")).feesOwedCents, 500);
  await db.doc("rides/p6").set({ customerId: "u1", status: "in_transit", paymentMethod: "card", driverId: "d1", finalFare: null, timestamp: admin.firestore.Timestamp.now() });
  await call("captureFare", { rideId: "p6", meterFare: 10, tipAmount: 0, paymentMethodId: "pm_card" }, rider("u1"));
  const p6 = await get("rides/p6");
  assert.equal(p6.capturedAmountCents, 1000 + 180 + 500, "fare + member card fee + earlier fee");
  assert.equal(p6.earlierFeesCents, 500);
  assert.equal((await get("users/u1")).feesOwedCents, 0);
  assert.equal((await get("drivers/d1")).leaseCreditCents, 1000, "both $5 fees reached the driver");
  await rejects(call("captureFare", { rideId: "p6", meterFare: 10, tipAmount: 0, paymentMethodId: "pm_card" }, rider("u1")), /already paid/);
  // Confirming the same Day Pass payment again can't renew it.
  await db.doc(`fast_passes/${pass.id}`).update({ expiresAt: Date.now() - 1000 });
  await call("confirmFastPass", { id: pass.id }, undefined).catch(() => {});
  assert.ok((await get(`fast_passes/${pass.id}`)).expiresAt < Date.now(), "replay must not renew the pass");

  // Arrival: the rider's phone, "I'm at the car", the wait clock; no fee when he wasn't really there.
  await freeDriver();
  await book("p7", { customerId: "u3" });
  await assign("p7");
  await call("riderPing", { rideId: "p7", ...PICKUP, acc: 12 }, rider("u3"));
  assert.equal((await get("driverInbox/d1")).current.riderPos.lat, PICKUP.lat);
  await rejects(call("riderPing", { rideId: "p7", ...PICKUP }, rider("u1")), /not found/);
  await call("driverPing", FAR, D1);
  const far = await call("driverArrived", { rideId: "p7", ...FAR }, D1);
  assert.ok(far.arrivedDistM > 5000 && far.near === false);
  await call("riderArrivalReply", { rideId: "p7", reply: "minute" }, rider("u3"));
  assert.equal((await get("driverInbox/d1")).current.riderReply.reply, "minute");
  await db.doc("rides/p7").update({ arrivedAt: Date.now() - 8 * MIN });
  const noFee = await call("driverEndCall", { rideId: "p7", reason: "no_show", note: "Nobody came out", ...FAR }, D1);
  assert.equal(noFee.fee, null, "no fee: driver wasn't at the pickup");

  // A ride handed to another car starts a fresh pickup clock (no inherited "I'm here").
  await freeDriver();
  await book("p9", { customerId: "u3" });
  await assign("p9");
  await call("driverPing", PICKUP, D1);
  await call("driverArrived", { rideId: "p9", ...PICKUP }, D1);
  assert.ok((await get("rides/p9")).arrivedAt > 0);
  await call("dispatcherAssign", { rideId: "p9", uid: null, force: true }, ADMIN);
  const p9 = await get("rides/p9");
  assert.deepEqual([p9.driverId, p9.arrivedAt, p9.headsUpAt, p9.arrivedNear ?? null], [null, null, null, null]);

  // Call-in rides: same as always. No-show any time, no fee.
  await freeDriver();
  await book("c3", { callIn: true });
  await assign("c3");
  const callIn = await call("driverEndCall", { rideId: "c3", reason: "no_show", note: "Not there", ...PICKUP }, D1);
  assert.deepEqual([callIn.outcome, callIn.fee], ["cancel", null]);

  // Private calls: riders need the perk; without calling keys the app falls back to the office.
  await freeDriver();
  await book("p8");
  await assign("p8");
  await rejects(call("startMaskedCall", { rideId: "p8" }, rider("u1")), /Day Pass and Premium/);
  const off = await call("startMaskedCall", { rideId: "p8" }, D1);
  assert.equal(off.mode, "off");
  assert.equal((await get("rides/p8")).calls?.driver, undefined, "a call that can't go through isn't counted");
  // With keys: Twilio rings the driver from the company number, plays the notice, records, connects the rider.
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tok_test", TWILIO_PHONE_NUMBER: "+17065550000" });
  let sent = null;
  global.fetch = async (url, opts) => {
    sent = { url, body: new URLSearchParams(opts.body), auth: opts.headers.Authorization };
    return { ok: true, json: async () => ({ sid: "CA123" }) };
  };
  const live = await call("startMaskedCall", { rideId: "p8" }, D1);
  assert.equal(live.mode, "live");
  assert.equal((await get("rides/p8")).calls.driver, 1);
  assert.match(sent.url, /Accounts\/AC_test\/Calls\.json$/);
  assert.deepEqual([sent.body.get("To"), sent.body.get("From")], ["+17065550144", "+17065550000"]);
  const twiml = sent.body.get("Twiml");
  assert.match(twiml, /may be recorded/);
  assert.match(twiml, /record="record-from-answer-dual"/);
  assert.match(twiml, /<Number>\+17065550142<\/Number>/);
  assert.ok(!twiml.includes("7065550144"), "the driver's real number is never passed to the rider");

  // Dispatcher: moving a car to a zone his GPS isn't in needs "move anyway";
  // a call he gave out over the radio puts the car on call until drop-off.
  await db.doc("board/d1").set({ carNumber: "44", status: "ready", zoneId: "downtown", lineKey: 1, rideId: null }, { merge: true });
  await db.doc("driverLocations/d1").set({ ...PICKUP, zoneId: "downtown", at: Date.now(), live: true });
  await rejects(call("dispatcherBoardAction", { uid: "d1", action: "ready", zoneId: "north" }, ADMIN), /GPS shows Downtown, not North Highland/);
  await call("dispatcherBoardAction", { uid: "d1", action: "ready", zoneId: "north", force: true }, ADMIN);
  let bd = await get("board/d1");
  assert.deepEqual([bd.zoneId, bd.movedAgainstGps], ["north", true]);
  await call("dispatcherBoardAction", { uid: "d1", action: "ready", zoneId: "downtown" }, ADMIN);
  await call("dispatcherBoardAction", { uid: "d1", action: "radio_call", note: "Kroger on Macon Rd" }, ADMIN);
  bd = await get("board/d1");
  assert.deepEqual([bd.status, bd.zoneId, bd.radioCall.note], ["on_call", "downtown", "Kroger on Macon Rd"]);
  await call("driverDropOff", PICKUP, D1);
  bd = await get("board/d1");
  assert.deepEqual([bd.status === "on_call", bd.radioCall], [false, null]);

  // Drivers agree to the current Driver Agreement before going online.
  await db.doc("drivers/d1").update({ agreement: { version: "old", docs: ["driver-agreement", "privacy"] } });
  await db.doc("board/d1").set({ status: "offline", rideId: null }, { merge: true });
  await rejects(call("driverGoOnline", PICKUP, D1), /Driver Agreement/);
  await rejects(call("driverCheckReady", PICKUP, D1), /Driver Agreement/);
  await rejects(call("driverGoMoving", PICKUP, D1), /Driver Agreement/);

  console.log("rideflow e2e: ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
