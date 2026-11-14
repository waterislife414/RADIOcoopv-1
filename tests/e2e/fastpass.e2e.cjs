// VIP Fast Pass on the Firestore emulator: paid on its own, then not charged again at checkout.
// Stripe is replaced by the demo stand-in (no network, nothing charged).
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../functions");
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_stand_in";
const stripePath = require.resolve(ROOT + "/node_modules/stripe");
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: require("../../src/demo/shims/stripe-server.cjs") };
const f = require(ROOT + "/index.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
const ADMIN = { uid: "boss", token: { admin: true } };
const get = async (p) => (await db.doc(p).get()).data();

(async () => {
  await require("./reset.cjs")(db);
  await assert.rejects(f.payFastPass.run({ data: {}, auth: null }), /card is required/);

  const paid = await f.payFastPass.run({ data: { paymentMethodId: "pm_demo_visa4242" }, auth: null });
  assert.equal(paid.status, "succeeded");
  const pass = await get(`fast_passes/${paid.id}`);
  assert.deepEqual([pass.amountCents, pass.status, pass.rideId, pass.uid], [500, "succeeded", null, "guest"]);

  const ride = (id, extra) =>
    db.doc(`rides/${id}`).set({ customerId: "guest", status: "completed", paymentMethod: "cash", wantsPriorityPass: true, outOfArea: false, ...extra });

  // Paid pass: the $5 is not added again, and the pass is now tied to this ride.
  await ride("r1", { fastPassId: paid.id });
  await f.captureFare.run({ data: { rideId: "r1", meterFare: 10, tipAmount: 0 }, auth: ADMIN });
  const r1 = await get("rides/r1");
  assert.equal(r1.capturedAmountCents, 1000 + 200, "meter + card fee only, no second $5");
  assert.equal((await get(`fast_passes/${paid.id}`)).rideId, "r1");

  // The same pass can't be reused on another ride; no pass at all still charges $5 at checkout.
  await ride("r2", { fastPassId: paid.id });
  await f.captureFare.run({ data: { rideId: "r2", meterFare: 10, tipAmount: 0 }, auth: ADMIN });
  assert.equal((await get("rides/r2")).capturedAmountCents, 1000 + 200 + 500);
  await ride("r3", {});
  await f.captureFare.run({ data: { rideId: "r3", meterFare: 10, tipAmount: 0 }, auth: ADMIN });
  assert.equal((await get("rides/r3")).capturedAmountCents, 1000 + 200 + 500);

  console.log("fastpass e2e: ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
