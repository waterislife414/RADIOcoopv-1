// Problem reports, dispatcher approval pop-ups, and the manager's free hand on the board.
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../functions");
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_stand_in";
const stripePath = require.resolve(ROOT + "/node_modules/stripe");
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: require("../../src/demo/shims/stripe-server.cjs") };
const f = require(ROOT + "/index.js");
const E = require(ROOT + "/dispatchEngine.js");
const timers = require(ROOT + "/timers.js");
const push = require(ROOT + "/push.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
timers.impl = async () => {};
push.impl = async (tokens) => ({ responses: tokens.map(() => ({})) });

const D1 = { uid: "d1", token: { driver: true } };
const ADMIN = { uid: "boss", token: { admin: true, name: "Desk" } };
const call = (fn, data, auth) => f[fn].run({ data, auth });
const get = async (p) => (await db.doc(p).get()).data();
async function rejects(p, re) {
  await assert.rejects(p, (e) => (assert.match(e.message, re), true));
}
const sq = (lat, lng, r = 0.01) => [{ lat: lat - r, lng: lng - r }, { lat: lat - r, lng: lng + r }, { lat: lat + r, lng: lng + r }, { lat: lat + r, lng: lng - r }];
const perms = (o = {}) => ({ location: "granted", notifications: "granted", camera: "granted", ...o });
const device = (p) => ({ appVersion: "1.2.3", phoneModel: "Pixel 7", permissions: perms(p), gpsState: "weak", lastFix: { lat: 32.48, lng: -84.95, accuracy: 480, ageSec: 12 }, errors: ["geo timeout"] });
const ask = (extra = {}) => ({ area: "check_ready", note: "GPS stuck", ask: { type: "check_ready", zoneId: "rose-hill" }, device: device(), ...extra });

(async () => {
  await require("./reset.cjs")(db);
  E._resetSettingsCache();
  await db.doc("zones/rose-hill").set({ label: "Rose Hill", points: sq(32.48, -84.95) });
  await db.doc("zones/east").set({ label: "East", points: sq(32.48, -84.9) });
  const mk = async (uid, car, status, zoneId, lineKey) => {
    await db.doc(`drivers/${uid}`).set({ carNumber: car, name: `Driver ${car}`, status: "offline", active: true, certs: {}, warnings: 0 });
    await db.doc(`board/${uid}`).set({ carNumber: car, status, zoneId, lineKey });
  };
  await mk("d1", "44", "offline", null, null);
  await mk("d2", "12", "ready", "rose-hill", 100);
  await mk("d3", "7", "ready", "rose-hill", 200);

  // A plain problem report is saved as a ticket (and queued for email only if addresses are set).
  await rejects(call("reportProblem", { area: "payment", note: "x" }, { uid: "r1", token: {} }), /approved driver/);
  await rejects(call("reportProblem", { area: "payment", note: "  " }, D1), /what went wrong/);
  const rep = await call("reportProblem", { area: "payment", note: "Card reader froze", device: device() }, D1);
  assert.equal(rep.approvalId, null);
  const t = await get(`support_tickets/${rep.ticketId}`);
  assert.deepEqual([t.uid, t.role, t.carNumber, t.area, t.status], ["d1", "driver", "44", "payment", "open"]);
  assert.equal(t.device.phoneModel, "Pixel 7");
  assert.equal(t.device.permissions.location, "granted");
  assert.equal(t.device.lastFix.accuracy, 480);

  // Ask dispatch: refused when location is off; no ticket, no approval.
  const before = (await db.collection("support_tickets").get()).size;
  await rejects(call("reportProblem", ask({ device: device({ location: "denied" }) }), D1), /back on/);
  assert.equal((await db.collection("approval_requests").get()).size, 0);
  assert.equal((await db.collection("support_tickets").get()).size, before);
  await rejects(call("reportProblem", ask({ ask: { type: "check_ready", zoneId: "nowhere" } }), D1), /Pick the zone/);

  // Ask dispatch with a glitchy GPS creates a pending approval; asking twice doesn't duplicate.
  const a = await call("reportProblem", ask(), D1);
  assert.ok(a.approvalId && a.ticketId);
  let ap = await get(`approval_requests/${a.approvalId}`);
  assert.deepEqual([ap.uid, ap.status, ap.zoneId, ap.carNumber], ["d1", "pending", "rose-hill", "44"]);
  assert.equal((await call("reportProblem", ask(), D1)).already, true);
  assert.equal((await db.collection("approval_requests").get()).size, 1);

  // Deny needs a reason; only the office answers.
  await rejects(call("answerApproval", { requestId: a.approvalId, decision: "deny" }, ADMIN), /Say why/);
  await rejects(call("answerApproval", { requestId: a.approvalId, decision: "approve" }, D1), /Dispatcher access/);
  await call("answerApproval", { requestId: a.approvalId, decision: "deny", reason: "You're at the Walmart, not Rose Hill" }, ADMIN);
  ap = await get(`approval_requests/${a.approvalId}`);
  assert.deepEqual([ap.status, ap.reason], ["denied", "You're at the Walmart, not Rose Hill"]);
  assert.equal((await get(`support_tickets/${a.ticketId}`)).status, "closed");
  await rejects(call("answerApproval", { requestId: a.approvalId, decision: "approve" }, ADMIN), /Already denied/);
  assert.equal((await get("board/d1")).status, "offline");

  // Approve: he goes to the back of the Rose Hill line with board.approval set.
  const b = await call("reportProblem", ask(), D1);
  assert.equal((await call("answerApproval", { requestId: b.approvalId, decision: "approve" }, ADMIN)).status, "approved");
  let d1 = await get("board/d1");
  assert.deepEqual([d1.status, d1.zoneId], ["ready", "rose-hill"]);
  assert.ok(d1.lineKey > 200, "behind d2 and d3");
  assert.deepEqual([d1.approval.by, d1.approval.zoneId, d1.approval.noGps], ["Desk", "rose-hill", true]);
  assert.ok(d1.approval.untilMs > Date.now());
  assert.equal((await get(`approval_requests/${b.approvalId}`)).status, "approved");
  assert.equal((await get(`support_tickets/${b.ticketId}`)).status, "approved");
  assert.equal(await get("owner_inbox/approvals_d1"), undefined, "2 approvals is not yet a pattern");

  // Three approvals in a week: the owner is told the phone needs fixing.
  const c = await call("reportProblem", ask(), D1);
  await call("answerApproval", { requestId: c.approvalId, decision: "approve" }, ADMIN);
  const d = await call("reportProblem", ask(), D1);
  await call("answerApproval", { requestId: d.approvalId, decision: "approve" }, ADMIN);
  const inbox = await get("owner_inbox/approvals_d1");
  assert.deepEqual([inbox.kind, inbox.uid, inbox.count, inbox.status], ["repeat_approvals", "d1", 3, "open"]);

  // The manager can change ANY car: an offered car and a car on an app ride.
  await db.doc("rides/o1").set({ customerId: "rider1", status: "pending", dispatchState: "offering", zoneId: "rose-hill", offerDriverId: "d2", offer: { driverId: "d2" }, pickup: "A" });
  await db.doc("board/d2").update({ status: "offered", offerRideId: "o1" });
  await call("dispatcherBoardAction", { uid: "d2", action: "radio_call", note: "Take the walk-up" }, ADMIN);
  const d2 = await get("board/d2");
  assert.notEqual(d2.status, "offered");
  assert.equal(d2.radioCall.note, "Take the walk-up");
  const o1 = await get("rides/o1");
  assert.deepEqual([o1.status, o1.dispatchState, o1.offerDriverId], ["pending", "escalated", null]);

  await db.doc("board/d3").update({ status: "offered", offerRideId: "o2" });
  await db.doc("rides/o2").set({ customerId: "rider1", status: "pending", dispatchState: "offering", offerDriverId: "d3", offer: { driverId: "d3" }, pickup: "A" });
  await call("dispatcherBoardAction", { uid: "d3", action: "off" }, ADMIN);
  assert.equal((await get("board/d3")).status, "offline");
  assert.equal((await get("rides/o2")).dispatchState, "escalated");

  // On an app ride, not picked up yet: radio_call/off releases the ride back to the dispatcher.
  await db.doc("rides/a1").set({ customerId: "rider1", status: "dispatched", driverId: "d1", carNumber: "44", pickup: "A" });
  await db.doc("board/d1").update({ status: "on_call", rideId: "a1" });
  await call("dispatcherBoardAction", { uid: "d1", action: "radio_call" }, ADMIN);
  let a1 = await get("rides/a1");
  assert.deepEqual([a1.status, a1.dispatchState, a1.driverId ?? null], ["pending", "escalated", null]);
  assert.notEqual((await get("board/d1")).rideId ?? null, "a1");

  await db.doc("rides/a2").set({ customerId: "rider1", status: "dispatched", driverId: "d1", carNumber: "44", pickup: "A" });
  await db.doc("board/d1").update({ status: "on_call", rideId: "a2" });
  await call("dispatcherBoardAction", { uid: "d1", action: "off" }, ADMIN);
  assert.equal((await get("rides/a2")).status, "pending");
  assert.equal((await get("board/d1")).status, "offline");

  // Mid-trip is different: the fare is finished, not handed back.
  await db.doc("rides/a3").set({ customerId: "rider1", status: "in_transit", driverId: "d1", carNumber: "44", pickup: "A" });
  await db.doc("board/d1").update({ status: "on_call", rideId: "a3" });
  await call("dispatcherBoardAction", { uid: "d1", action: "off" }, ADMIN);
  assert.equal((await get("rides/a3")).status, "finished");

  console.log("support e2e: ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
