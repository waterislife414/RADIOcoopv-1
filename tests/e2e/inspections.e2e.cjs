// Vehicle inspections, the shop board and rider cancellation, on the emulator.
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../functions");
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_stand_in";
const stripePath = require.resolve(ROOT + "/node_modules/stripe");
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: require("../../src/demo/shims/stripe-server.cjs") };
const f = require(ROOT + "/index.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();

const LOC = { lat: 32.6, lng: -84.6, accuracy: 10 };
const DRIVER = { uid: "d1", token: { driver: true } };
const SHOP = { uid: "m1", token: { shop: true, email: "shop@example.com" } };
const ADMIN = { uid: "boss", token: { admin: true } };
const call = (fn, data, auth) => f[fn].run({ data, auth });
const get = async (p) => (await db.doc(p).get()).data();
async function rejects(p, re) {
  await assert.rejects(p, (e) => {
    assert.match(e.message, re);
    return true;
  });
}

(async () => {
  await require("./reset.cjs")(db);
  const c = await import(ROOT + "/lib/inspectionCore.mjs");
  await db.doc("drivers/d1").set({ carNumber: "44", name: "Pat Example", status: "offline", active: true, certs: {}, warnings: 0, agreement: { version: require("../../functions/branding.json").legalVersion, docs: ["driver-agreement", "privacy"] } });
  await db.doc("board/d1").set({ carNumber: "44", status: "offline", zoneId: null, lineKey: null });

  // No inspection yet: can't go on the board.
  await rejects(call("driverGoOnline", LOC, DRIVER), /first full inspection/);

  const photos = Object.fromEntries(c.PHOTO_SLOTS.filter((s) => !s.optional).map((s) => [s.id, `inspections/d1/${s.id}.jpg`]));
  const fluids = Object.fromEntries(c.FLUIDS.map((x) => [x.id, "ok"]));
  const checks = Object.fromEntries(c.CHECKS.map((x) => [x.id, "ok"]));
  const base = { type: "initial", photos, fluids, checks, mileage: 84210, signedName: "Pat Example", damageAnswered: true };

  await rejects(call("submitInspection", { ...base, photos: { front: photos.front } }, DRIVER), /required photos/);
  await rejects(call("submitInspection", { ...base, photos: { ...photos, front: "inspections/someoneelse/x.jpg" } }, DRIVER), /your own/);
  await rejects(call("submitInspection", base, { uid: "r1", token: {} }), /approved driver/);

  const res = await call("submitInspection", {
    ...base,
    fluids: { ...fluids, brakeFluid: "shop" },
    checks: { ...checks, brakes: "problem" },
    checkNotes: { brakes: "Squeal when stopping" },
    damages: [
      { area: "Front bumper", photo: "inspections/d1/dmg1.jpg", description: "Scrape", preExisting: true },
      { area: "Back-left door", photo: "inspections/d1/dmg2.jpg", description: "Dent" },
    ],
    repairs: [{ item: "Rattle or clunk", description: "Rattle in back over bumps", urgency: "watch" }],
  }, DRIVER);
  assert.equal(res.workOrders, 4, "brake fluid, brakes, new dent, rattle (old scrape is not a work order)");
  const insp = await get(`vehicle_inspections/${res.id}`);
  assert.equal(insp.carNumber, "44");
  assert.equal(insp.driverName, "Pat Example");
  assert.equal((await get("vehicles/44")).openRepairs, 4);
  assert.equal((await get("vehicles/44")).mileage, 84210);
  const d1 = await get("drivers/d1");
  assert.equal(d1.inspection.carNumber, "44");
  assert.ok(d1.inspection.initialAt && d1.inspection.lastFullAt && d1.inspection.shiftCheckAt);

  // Inspection done: on the board.
  assert.equal((await call("driverGoOnline", LOC, DRIVER)).status, "moving");
  await call("driverGoOffline", LOC, DRIVER);

  // Next shift: quick check required, then fine.
  await db.doc("drivers/d1").update({ "inspection.shiftCheckAt": Date.now() - 20 * 3600000 });
  await rejects(call("driverGoOnline", LOC, DRIVER), /start-of-shift/);
  await call("submitInspection", { type: "shift", noNewDamage: true, signedName: "Pat Example" }, DRIVER);
  assert.equal((await call("driverGoOnline", LOC, DRIVER)).status, "moving");
  await call("driverGoOffline", LOC, DRIVER);

  // Weekly overdue.
  await db.doc("drivers/d1").update({ "inspection.lastFullAt": Date.now() - 8 * 86400000 });
  await rejects(call("driverGoOnline", LOC, DRIVER), /weekly/);

  // New car: a new 360 is needed.
  await db.doc("drivers/d1").update({ carNumber: "12", "inspection.lastFullAt": Date.now() });
  await rejects(call("driverGoOnline", LOC, DRIVER), /first full inspection/);

  // Shop board: drivers can't change work orders; the shop can; open count follows.
  const orders = (await db.collection("work_orders").where("carNumber", "==", "44").get()).docs;
  assert.equal(orders.length, 4);
  const brakes = orders.find((o) => o.data().item === "Brakes");
  assert.equal(brakes.data().description, "Squeal when stopping");
  assert.equal(brakes.data().reportedBy.uid, "d1");
  await rejects(call("updateWorkOrder", { id: brakes.id, status: "done" }, DRIVER), /Office or shop/);
  await call("updateWorkOrder", { id: brakes.id, status: "parts_ordered", shopNotes: "Pads ordered" }, SHOP);
  assert.equal((await get("vehicles/44")).openRepairs, 4, "parts ordered is still open");
  await call("updateWorkOrder", { id: brakes.id, status: "done" }, SHOP);
  assert.equal((await get("vehicles/44")).openRepairs, 3);
  const doneWo = await get(`work_orders/${brakes.id}`);
  assert.deepEqual(doneWo.history.map((h) => h.status), ["open", "parts_ordered", "done"]);
  assert.equal(doneWo.shopNotes, "Pads ordered");
  await call("createWorkOrder", { carNumber: "44", item: "Tires", description: "Rotate tires", urgency: "soon" }, SHOP);
  assert.equal((await get("vehicles/44")).openRepairs, 4);
  await rejects(call("setShopAccess", { email: "x@example.com" }, SHOP), /Office only/);

  // Riders cancel their own ride; not someone else's; a call-in ride is cancelled by phone. Office-only declineRide.
  await db.doc("rides/r1").set({ customerId: "rider1", status: "pending", paymentMethod: "card", paymentIntentId: "pi_demo_1" });
  await db.doc("rides/r2").set({ customerId: "rider1", status: "dispatched", driverId: "d9", paymentMethod: "cash", source: "phone" });
  await rejects(call("cancelMyRide", { rideId: "r1" }, { uid: "rider2", token: {} }), /not found/);
  await rejects(call("cancelMyRide", { rideId: "r2" }, { uid: "rider1", token: {} }), /call us/);
  await rejects(call("cancelMyRide", { rideId: "r1" }, null), /Sign in/);
  assert.deepEqual(await call("cancelMyRide", { rideId: "r1" }, { uid: "rider1", token: {} }), { cancelled: true, feeCents: 0 });
  assert.equal((await db.doc("rides/r1").get()).exists, false);
  assert.equal((await get("cancelled_rides/r1")).cancelledBy, "rider");
  await rejects(call("declineRide", { rideId: "r2" }, { uid: "rider1", token: {} }), /Dispatchers only/);
  await call("declineRide", { rideId: "r2" }, ADMIN);

  console.log("inspections e2e: ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
