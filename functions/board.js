// Live driver state on the zone board: GPS pings, Go Online, Check Ready,
// Moving, Go Offline, and the once-a-minute sweep that takes drivers off
// the board when their phone stops reporting. board/{uid} is written only
// by Cloud Functions, so nobody can move himself up a line from the app.
//
// Location goes through a callable instead of a direct Firestore write so a
// phone that was offline can't replay old fixes that look fresh, and so the
// zone is worked out on the server.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const BRANDING = require("./branding.json");
const { getZones } = require("./zoneStore");

const DISPATCH = BRANDING.dispatch || {};
const GPS = { staleMin: 3, outOfZoneMin: 3, ...(DISPATCH.gps || {}) };
const TIME_ZONE = DISPATCH.timeZone || "America/New_York";

const db = () => admin.firestore();
const serverNow = () => admin.firestore.FieldValue.serverTimestamp();
let corePromise = null;
const core = () => (corePromise ||= import("./lib/dispatchCore.mjs"));

const boardRef = (uid) => db().collection("board").doc(uid);
const driverRef = (uid) => db().collection("drivers").doc(uid);
const locationRef = (uid) => db().collection("driverLocations").doc(uid);

function requireDriver(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.driver !== true) {
    throw new HttpsError("permission-denied", "This needs an approved driver account.");
  }
  return request.auth.uid;
}

function readFix(data) {
  const lat = Number(data?.lat);
  const lng = Number(data?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpsError("failed-precondition", "Your location is off. Turn on Location for this app.");
  }
  const acc = Number(data?.accuracy);
  return { lat, lng, accuracy: Number.isFinite(acc) ? Math.round(acc) : null };
}

// Why this driver can't work right now, or null. The lease lockout joins
// this list when the lease ledger is built.
function blockReason(driver) {
  if (!driver || driver.active === false) return "Your driver account isn't active. See the office.";
  if (driver.status === "suspended") return "You're suspended. Come back to the shop to get reinstated.";
  return null;
}

/**
 * Runs one status change in a transaction: reads the board, driver and
 * location records, records the fix if one was sent, and applies the patch
 * returned by decide(). decide() throws HttpsError to refuse.
 */
async function changeStatus(uid, data, decide, { needFix = true } = {}) {
  const c = await core();
  const fix = needFix || data?.lat != null ? readFix(data) : null;
  const zones = await getZones();
  const gpsZoneId = fix ? c.zoneForPoint(zones, fix.lng, fix.lat) : null;
  const nowMs = Date.now();

  return db().runTransaction(async (tx) => {
    const [b, d] = await Promise.all([tx.get(boardRef(uid)), tx.get(driverRef(uid))]);
    if (!b.exists || !d.exists) throw new HttpsError("failed-precondition", "You're not on the driver roster yet.");
    const board = b.data();
    const driver = d.data();
    const patch = decide({ c, board, driver, zones, gpsZoneId, nowMs }) || {};
    const next = { ...board, ...patch };
    if (Object.keys(patch).length) tx.update(boardRef(uid), { ...patch, updatedAt: serverNow() });
    const loc = { live: c.isLive(next.status), outOfZoneSince: null };
    if (fix) Object.assign(loc, fix, { zoneId: gpsZoneId, at: nowMs });
    tx.set(locationRef(uid), loc, { merge: true });
    return { status: next.status, zoneId: next.zoneId ?? null, gpsZoneId };
  });
}

// GPS heartbeat from the driver's phone: every 50 m moved, at least every 45 s.
exports.driverPing = onCall(async (request) => {
  const uid = requireDriver(request);
  const fix = readFix(request.data);
  const c = await core();
  const zones = await getZones();
  const gpsZoneId = c.zoneForPoint(zones, fix.lng, fix.lat);
  const nowMs = Date.now();

  return db().runTransaction(async (tx) => {
    const [b, l] = await Promise.all([tx.get(boardRef(uid)), tx.get(locationRef(uid))]);
    if (!b.exists) throw new HttpsError("failed-precondition", "You're not on the driver roster yet.");
    const board = b.data();
    const res = c.applyLocation(
      { status: board.status, zoneId: board.zoneId, outOfZoneSince: l.exists ? l.data().outOfZoneSince : null },
      gpsZoneId,
      nowMs,
      GPS.outOfZoneMin
    );
    if (res.board) tx.update(boardRef(uid), { ...res.board, updatedAt: serverNow() });
    const status = res.board?.status ?? board.status;
    tx.set(locationRef(uid), {
      ...fix,
      zoneId: gpsZoneId,
      at: nowMs,
      live: c.isLive(status),
      outOfZoneSince: res.outOfZoneSince,
    });
    return {
      status,
      zoneId: res.board ? res.board.zoneId : board.zoneId ?? null,
      gpsZoneId,
      outOfZoneSince: res.outOfZoneSince,
    };
  });
});

// Off the board → Moving (on the board, not in a line yet).
exports.driverGoOnline = onCall(async (request) => {
  const uid = requireDriver(request);
  return changeStatus(uid, request.data, ({ c, board, driver }) => {
    const blocked = blockReason(driver);
    if (blocked) throw new HttpsError("failed-precondition", blocked);
    if (board.status !== c.STATUS.OFFLINE) return null; // already on the board
    return { status: c.STATUS.MOVING, zoneId: null, lineKey: null };
  });
});

// Check Ready in the zone the phone is in. Back of that zone's line.
exports.driverCheckReady = onCall(async (request) => {
  const uid = requireDriver(request);
  return changeStatus(uid, request.data, ({ c, board, driver, zones, gpsZoneId, nowMs }) => {
    const blocked = blockReason(driver);
    if (blocked) throw new HttpsError("failed-precondition", blocked);
    if (board.status === c.STATUS.OFFERED) throw new HttpsError("failed-precondition", "Answer the call first.");
    if (board.status === c.STATUS.ON_CALL) throw new HttpsError("failed-precondition", "Drop off your fare first.");
    if (!gpsZoneId) {
      throw new HttpsError("failed-precondition", "You're not inside a zone. Drive into one, then check ready.");
    }
    const zone = zones.find((z) => z.id === gpsZoneId);
    if (zone?.requiresCert && !c.hasCert(driver, zone.requiresCert, nowMs)) {
      throw new HttpsError("failed-precondition", `${zone.label} is for certified drivers only.`);
    }
    if (board.status === c.STATUS.READY && board.zoneId === gpsZoneId) return null; // keep your spot
    const ready = c.applyCheckReady(gpsZoneId, nowMs);
    return { status: ready.status, zoneId: ready.zoneId, lineKey: ready.lineKey };
  });
});

// Leaving the line on purpose: on the board, no zone.
exports.driverGoMoving = onCall(async (request) => {
  const uid = requireDriver(request);
  return changeStatus(uid, request.data, ({ c, board, driver }) => {
    const blocked = blockReason(driver);
    if (blocked) throw new HttpsError("failed-precondition", blocked);
    if (board.status === c.STATUS.OFFERED) throw new HttpsError("failed-precondition", "Answer the call first.");
    if (board.status === c.STATUS.ON_CALL) throw new HttpsError("failed-precondition", "Drop off your fare first.");
    if (board.status === c.STATUS.MOVING) return null;
    return { status: c.STATUS.MOVING, zoneId: null, lineKey: null };
  });
});

exports.driverGoOffline = onCall(async (request) => {
  const uid = requireDriver(request);
  return changeStatus(
    uid,
    request.data,
    ({ c, board }) => {
      if (board.status === c.STATUS.OFFERED) throw new HttpsError("failed-precondition", "Answer the call first.");
      if (board.status === c.STATUS.ON_CALL) throw new HttpsError("failed-precondition", "Drop off your fare first.");
      if (board.status === c.STATUS.OFFLINE) return null;
      return { status: c.STATUS.OFFLINE, zoneId: null, lineKey: null };
    },
    { needFix: false }
  );
});

// Every minute: anyone ready or moving whose phone hasn't reported in
// staleMin minutes goes off the board. The query only returns stale phones,
// so a normal minute costs one read.
exports.sweepStaleDrivers = onSchedule(
  { schedule: "every 1 minutes", timeZone: TIME_ZONE },
  async () => {
    const c = await core();
    const nowMs = Date.now();
    const cutoff = nowMs - GPS.staleMin * 60 * 1000;
    const snap = await db()
      .collection("driverLocations")
      .where("live", "==", true)
      .where("at", "<", cutoff)
      .get();
    let dropped = 0;
    for (const doc of snap.docs) {
      await db().runTransaction(async (tx) => {
        const [b, l] = await Promise.all([tx.get(boardRef(doc.id)), tx.get(doc.ref)]);
        const loc = l.data();
        if (!loc?.live || loc.at >= cutoff) return; // pinged since the query
        const patch = b.exists ? c.staleLocationPatch(b.data(), loc.at, nowMs, GPS.staleMin) : null;
        if (patch) {
          tx.update(boardRef(doc.id), { ...patch, updatedAt: serverNow() });
          dropped++;
        }
        tx.update(doc.ref, { live: false, outOfZoneSince: null });
      });
    }
    if (dropped) console.log(`Took ${dropped} driver(s) off the board: location stopped.`);
    return null;
  }
);
