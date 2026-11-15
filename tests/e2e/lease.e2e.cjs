// Lease ledger end to end on the Firestore emulator.
const assert = require("node:assert/strict");
const ROOT = require("node:path").resolve(__dirname, "../../functions");
const f = require(ROOT + "/index.js");
const L = require(ROOT + "/lease.js")._internal;
const E = require(ROOT + "/dispatchEngine.js");
require(ROOT + "/timers.js").impl = async () => {};
require(ROOT + "/push.js").impl = async (t) => ({ responses: t.map(() => ({})) });
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();

const ADMIN = { uid: "boss", token: { admin: true } };
const as = (fn, data, auth = ADMIN) => f[fn].run({ data, auth });
const drv = (uid) => ({ uid, token: { driver: true } });
const get = async (p) => (await db.doc(p).get()).data();
const at = (iso) => Date.parse(iso);
async function rejects(p, re) { await assert.rejects(p, (e) => (assert.match(e.message, re), true)); }
const sq = (lat, lng, r = 0.01) => [{ lat: lat - r, lng: lng - r }, { lat: lat - r, lng: lng + r }, { lat: lat + r, lng: lng + r }, { lat: lat + r, lng: lng - r }];
const RH = { lat: 32.48, lng: -84.95 };
async function rideUpdate(id, before, after) {
  await db.doc(`rides/${id}`).set(after);
  await f.creditCardFare.run({ data: { before: { data: () => before }, after: { data: () => after } }, params: { rideId: id } });
}

(async () => {
  await require("./reset.cjs")(db);
  E._resetSettingsCache();
  const core = await import(ROOT + "/lib/dispatchCore.mjs");
  await db.doc("zones/rose-hill").set({ label: "Rose Hill", points: sq(RH.lat, RH.lng) });
  const mk = async (uid, car, extra = {}) => {
    await db.doc(`drivers/${uid}`).set({ carNumber: car, agreement: { version: require("../../functions/branding.json").legalVersion, docs: ["driver-agreement", "privacy"] }, inspection: { carNumber: String(car), initialAt: Date.now(), lastFullAt: Date.now(), shiftCheckAt: Date.now() }, status: "offline", active: true, certs: {}, warnings: 0, leaseCreditCents: 0, leaseOwedCents: 0, ...extra });
    await db.doc(`board/${uid}`).set({ carNumber: car, status: "offline", zoneId: null, lineKey: null });
  };
  await mk("d1", "44");
  await mk("d2", "12");

  // 1. Going on the board opens this period's lease
  await f.driverGoOnline.run({ data: RH, auth: drv("d1") });
  const key = core.leasePeriodKey(Date.now(), { timeZone: "America/New_York", lease: { dueStart: "14:00" } });
  assert.equal((await get(`ledger/d1/days/${key}`)).open, true);

  // 2. Card fare + tip credited once; cash and unpaid overrides ignored
  const base = { driverId: "d1", paymentMethod: "card", finalFare: null };
  const paid = { ...base, finalFare: 50, tipAmount: 5, stripeStatus: "succeeded" };
  await rideUpdate("c1", base, paid);
  await rideUpdate("c1", base, paid); // duplicate event
  await rideUpdate("c2", { ...base, paymentMethod: "cash" }, { ...base, paymentMethod: "cash", finalFare: 20, stripeStatus: "succeeded" });
  await rideUpdate("c3", base, { ...base, finalFare: 20, stripeStatus: "manual_override" });
  await rideUpdate("c4", { ...base, driverId: "radio-9" }, { ...paid, driverId: "radio-9" });
  let day = await get(`ledger/d1/days/${key}`);
  assert.deepEqual([day.cardFaresCents, day.cardTipsCents, day.cardRides], [5000, 500, 1]);

  // 3. Settlement: $110 card day → covered, $35 credit; next day nothing → $40 envelope
  await db.doc("ledger/d2/days/2026-11-10").set({ periodKey: "2026-11-10", open: true, cardFaresCents: 11000, cardTipsCents: 0 });
  await db.doc("ledger/d2/days/2026-11-11").set({ periodKey: "2026-11-11", open: true });
  assert.equal(await L.settleDue(at("2026-11-10T15:00:00Z")), 0); // 10 AM: not due yet
  assert.equal(await L.settleDue(at("2026-11-10T19:30:00Z")), 1); // 2:30 PM
  let d2 = await get("drivers/d2");
  assert.equal(d2.leaseCreditCents, 3500); assert.equal(d2.leaseOwedCents, 0);
  assert.equal((await get("ledger/d2/days/2026-11-10")).coveredByCard, true);
  await L.settleDue(at("2026-11-11T19:30:00Z"));
  d2 = await get("drivers/d2");
  assert.deepEqual([d2.leaseCreditCents, d2.leaseOwedCents, d2.leaseOwedPeriodKey], [0, 4000, "2026-11-11"]);
  assert.equal((await get("ledger/d2/days/2026-11-11")).envelopeDueCents, 4000);
  assert.equal(await L.settleDue(at("2026-11-11T19:31:00Z")), 0); // idempotent

  // 4. Owed from an earlier day → locked: can't check ready, 4 PM sweep takes him off, auto skips him
  await rejects(f.driverCheckReady.run({ data: RH, auth: drv("d2") }), /Lease not paid \(\$40\.00\)/);
  await db.doc("board/d2").update({ status: "ready", zoneId: "rose-hill", lineKey: 1 });
  await db.doc("settings/dispatch").set({ mode: "auto" }); E._resetSettingsCache();
  await db.doc("rides/r1").set({ status: "pending", zoneId: "rose-hill", zoneLabel: "Rose Hill", pickup: "x", customerId: "guest", dispatchState: "new", timestamp: admin.firestore.Timestamp.now() });
  await E.startDispatch("r1");
  assert.notEqual((await get("rides/r1")).offer?.driverId, "d2");
  assert.equal(await L.lockUnpaid(), 1);
  const b2 = await get("board/d2");
  assert.deepEqual([b2.status, b2.lastEvent.type, b2.lastEvent.owedCents], ["offline", "lease_lock", 4000]);

  // 5. Envelope logged → unlocked; office counts it short → flagged; adjustments
  await rejects(f.logEnvelope.run({ data: {}, auth: drv("d1") }), /don't owe/);
  const env = await f.logEnvelope.run({ data: {}, auth: drv("d2") });
  assert.equal(env.amountCents, 4000);
  assert.equal((await get("drivers/d2")).leaseOwedCents, 0);
  await f.driverGoOnline.run({ data: RH, auth: drv("d2") });
  await rejects(as("receiveEnvelope", { envelopeId: env.envelopeId, receivedCents: 3000 }, drv("d2")), /Dispatcher/);
  const rec = await as("receiveEnvelope", { envelopeId: env.envelopeId, receivedCents: 3000 });
  assert.equal(rec.mismatchCents, -1000);
  await rejects(as("receiveEnvelope", { envelopeId: env.envelopeId, receivedCents: 3000 }), /Already counted/);
  await as("adjustLease", { uid: "d2", kind: "owe", cents: 1000, note: "short envelope", envelopeId: env.envelopeId });
  await rejects(as("adjustLease", { uid: "d2", kind: "owe", cents: 1000, envelopeId: env.envelopeId }), /Already added/);
  assert.ok((await get(`envelopes/${env.envelopeId}`)).shortHandledAt);
  assert.equal((await get("drivers/d2")).leaseOwedCents, 1000);
  await as("adjustLease", { uid: "d2", kind: "owe", cents: -1000, note: "found it" });
  assert.equal((await get("drivers/d2")).leaseOwedCents, 0);
  await as("adjustLease", { uid: "d2", kind: "credit", cents: 500, note: "clean week" });
  assert.equal((await get("drivers/d2")).leaseCreditCents, 500);
  await rejects(as("adjustLease", { uid: "d2", kind: "credit", cents: -900 }), /only has \$5\.00/);
  await as("adjustLease", { uid: "d2", kind: "waive", periodKey: "2026-11-20", note: "car in shop" });
  await L.settleDue(at("2026-11-20T19:30:00Z"));
  const w = await get("ledger/d2/days/2026-11-20");
  assert.deepEqual([w.leaseDueCents, w.envelopeDueCents], [0, 0]);
  // His real period from going online today settled first (oldest first): $5 credit against $75.
  const todayKey = core.leasePeriodKey(Date.now(), { timeZone: "America/New_York", lease: { dueStart: "14:00" } });
  assert.equal((await get(`ledger/d2/days/${todayKey}`)).envelopeDueCents, 7000);
  await rejects(as("adjustLease", { uid: "d2", kind: "waive", periodKey: "2026-11-20" }), /already settled/);
  const entries = await db.collection("ledger/d2/entries").get();
  assert.equal(entries.size, 4);

  console.log("LEASE E2E: all assertions passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
