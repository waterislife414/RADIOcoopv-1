const assert = require("node:assert/strict");
const ROOT = require("node:path").resolve(__dirname, "../../functions");
const f = require(ROOT + "/index.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
const sq = (lat, lng, r = 0.01) => [
  { lat: lat - r, lng: lng - r }, { lat: lat - r, lng: lng + r },
  { lat: lat + r, lng: lng + r }, { lat: lat + r, lng: lng - r },
];
const RH = { lat: 32.48, lng: -84.95 }, FB = { lat: 32.36, lng: -84.95 }, NOWHERE = { lat: 32.6, lng: -84.6 };
const auth = (uid, extra = {}) => ({ uid, token: { driver: true, ...extra } });
const call = (fn, uid, data, a) => f[fn].run({ data, auth: a || auth(uid) });
const board = async (uid) => (await db.doc(`board/${uid}`).get()).data();
const loc = async (uid) => (await db.doc(`driverLocations/${uid}`).get()).data();
async function rejects(p, re) { await assert.rejects(p, (e) => { assert.match(e.message, re); return true; }); }

(async () => {
  await db.doc("zones/rose-hill").set({ label: "Rose Hill", points: sq(RH.lat, RH.lng) });
  await db.doc("zones/fort-benning").set({ label: "Fort Benning", requiresCert: "base", points: sq(FB.lat, FB.lng) });
  for (const [uid, car] of [["d1", "44"], ["d2", "12"], ["d3", "7"]]) {
    await db.doc(`drivers/${uid}`).set({ carNumber: car, status: "offline", active: true, certs: {}, warnings: 0 });
    await db.doc(`board/${uid}`).set({ carNumber: car, status: "offline", zoneId: null, lineKey: null });
  }

  await rejects(call("driverGoOnline", "x", NOWHERE, { uid: "x", token: {} }), /approved driver/);
  let r = await call("driverGoOnline", "d1", NOWHERE);
  assert.equal(r.status, "moving"); assert.equal(r.gpsZoneId, null);
  assert.equal((await loc("d1")).live, true);
  await rejects(call("driverCheckReady", "d1", NOWHERE), /not inside a zone/);
  await rejects(call("driverCheckReady", "d1", {}), /Location/);

  r = await call("driverCheckReady", "d1", RH);
  assert.deepEqual([r.status, r.zoneId], ["ready", "rose-hill"]);
  const k1 = (await board("d1")).lineKey;
  r = await call("driverCheckReady", "d1", RH); // again: keeps spot
  assert.equal((await board("d1")).lineKey, k1);
  await new Promise((s) => setTimeout(s, 5));
  r = await call("driverCheckReady", "d2", RH); // offline → straight to ready
  assert.ok((await board("d2")).lineKey > k1, "d2 behind d1");

  // d1 leaves the zone: timer starts, still ready
  r = await call("driverPing", "d1", NOWHERE);
  assert.equal(r.status, "ready"); assert.ok(r.outOfZoneSince);
  await db.doc("driverLocations/d1").update({ outOfZoneSince: Date.now() - 4 * 60_000 });
  r = await call("driverPing", "d1", NOWHERE);
  assert.equal(r.status, "moving");
  let b = await board("d1");
  assert.equal(b.lineKey, null); assert.equal(b.lastEvent.type, "left_zone"); assert.equal(b.lastEvent.zoneId, "rose-hill");

  // back in zone after leaving: timer resets
  await call("driverCheckReady", "d1", RH);
  await call("driverPing", "d1", NOWHERE);
  r = await call("driverPing", "d1", RH);
  assert.equal((await loc("d1")).outOfZoneSince, null); assert.equal(r.status, "ready");

  // Fort Benning: cert gate
  await rejects(call("driverCheckReady", "d3", FB), /certified drivers only/);
  await db.doc("drivers/d3").update({ "certs.base": { status: "approved", expiresAt: Date.now() + 86400e3 } });
  r = await call("driverCheckReady", "d3", FB);
  assert.equal(r.zoneId, "fort-benning");

  // stale sweep: d2 phone quiet 5 min
  await db.doc("driverLocations/d2").update({ at: Date.now() - 5 * 60_000 });
  await f.sweepStaleDrivers.run({});
  b = await board("d2");
  assert.equal(b.status, "offline"); assert.equal(b.lastEvent.type, "gps_lost");
  assert.equal((await loc("d2")).live, false);
  assert.equal((await board("d1")).status, "ready", "fresh driver untouched");

  // on-call never swept or moved
  await db.doc("board/d3").update({ status: "on_call" });
  await db.doc("driverLocations/d3").update({ at: Date.now() - 10 * 60_000 });
  await f.sweepStaleDrivers.run({});
  assert.equal((await board("d3")).status, "on_call");
  await rejects(call("driverGoOffline", "d3", {}), /Drop off/);
  await rejects(call("driverGoMoving", "d3", RH), /Drop off/);

  r = await call("driverGoMoving", "d1", RH);
  assert.equal(r.status, "moving");
  r = await call("driverGoOffline", "d1", {});
  assert.equal(r.status, "offline"); assert.equal((await loc("d1")).live, false);

  await db.doc("drivers/d1").update({ status: "suspended" });
  await rejects(call("driverGoOnline", "d1", RH), /suspended/);
  console.log("BOARD E2E: all assertions passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
