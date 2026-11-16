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
const { requireDriver, blockReason, LEASE_CFG } = require("./workRules");
let inspectionCorePromise = null;
const inspectionCore = () => (inspectionCorePromise ||= import("./lib/inspectionCore.mjs"));

const DISPATCH = BRANDING.dispatch || {};
const GPS = { staleMin: 3, outOfZoneMin: 3, maxAccuracyMeters: 100, ...(DISPATCH.gps || {}) };
const TIME_ZONE = DISPATCH.timeZone || "America/New_York";

const db = () => admin.firestore();
const serverNow = () => admin.firestore.FieldValue.serverTimestamp();
let corePromise = null;
const core = () => (corePromise ||= import("./lib/dispatchCore.mjs"));
let timingPromise = null;
const timing = () => (timingPromise ||= import("./lib/rideTiming.mjs"));

const boardRef = (uid) => db().collection("board").doc(uid);
const driverRef = (uid) => db().collection("drivers").doc(uid);
const locationRef = (uid) => db().collection("driverLocations").doc(uid);

function readFix(data) {
  const lat = Number(data?.lat);
  const lng = Number(data?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpsError("failed-precondition", "Your location is off. Turn on Location for this app.");
  }
  const acc = Number(data?.accuracy);
  return { lat, lng, accuracy: Number.isFinite(acc) ? Math.round(acc) : null };
}

/**
 * Runs one status change in a transaction: reads the board, driver and
 * location records, records the fix if one was sent, and applies the patch
 * returned by decide(). decide() throws HttpsError to refuse.
 */
async function changeStatus(uid, data, decide, { needFix = true } = {}) {
  const c = await core();
  const ic = await inspectionCore();
  const fix = needFix || data?.lat != null ? readFix(data) : null;
  const zones = await getZones();
  const gpsZoneId = fix ? c.zoneForPoint(zones, fix.lng, fix.lat) : null;
  const nowMs = Date.now();

  const dayRef = db().collection("ledger").doc(uid).collection("days").doc(c.leasePeriodKey(nowMs, LEASE_CFG));

  return db().runTransaction(async (tx) => {
    const [b, d, day] = await Promise.all([tx.get(boardRef(uid)), tx.get(driverRef(uid)), tx.get(dayRef)]);
    if (!b.exists || !d.exists) throw new HttpsError("failed-precondition", "You're not on the driver roster yet.");
    const board = b.data();
    const driver = d.data();
    const patch = decide({ c, board, driver, zones, gpsZoneId, nowMs }) || {};
    const next = { ...board, ...patch };
    // Any way back onto the board (Go Online, Check Ready, Moving) needs the
    // current Driver Agreement and a current vehicle check.
    if (board.status === c.STATUS.OFFLINE && next.status !== c.STATUS.OFFLINE) {
      const docs = driver.agreement?.docs || [];
      const agreed = driver.agreement?.version === BRANDING.legalVersion && docs.includes("driver-agreement") && docs.includes("privacy");
      if (!agreed) throw new HttpsError("failed-precondition", "Read and agree to the Driver Agreement first.", { agreement: true });
      const needed = ic.inspectionNeeded(driver.inspection, driver.carNumber, nowMs);
      if (needed) throw new HttpsError("failed-precondition", ic.NEEDED_MESSAGE[needed], { inspection: needed });
    }
    if (Object.keys(patch).length) tx.update(boardRef(uid), { ...patch, updatedAt: serverNow() });
    // Being on the board in a lease period means that period's lease is owed.
    if (next.status !== c.STATUS.OFFLINE && !day.data()?.settledAt) {
      tx.set(dayRef, { periodKey: dayRef.id, open: true, workedAt: day.data()?.workedAt ?? nowMs }, { merge: true });
    }
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
  const T = await timing();
  const rules = T.rulesFrom(BRANDING.rideRules);
  const zones = await getZones();
  const gpsZoneId = c.zoneForPoint(zones, fix.lng, fix.lat);
  const nowMs = Date.now();

  return db().runTransaction(async (tx) => {
    const [b, l] = await Promise.all([tx.get(boardRef(uid)), tx.get(locationRef(uid))]);
    if (!b.exists) throw new HttpsError("failed-precondition", "You're not on the driver roster yet.");
    const board = b.data();
    // On a call: the rider's ETA, the "about 4 minutes away" alert, and the
    // car on the rider's map when their pass or membership includes it.
    const rideDoc = board.rideId ? db().collection("rides").doc(board.rideId) : null;
    const ride = rideDoc ? (await tx.get(rideDoc)).data() : null;
    if (ride && ride.driverId === uid && ["dispatched", "in_transit"].includes(ride.status)) {
      const patch = {};
      if (ride.status === "dispatched") {
        const eta = T.etaMinutes(fix, T.pickupPoint(ride), rules);
        // Only write when the minutes change: every ride write wakes the ride triggers.
        if ((ride.eta?.minutes ?? null) !== eta) patch.eta = eta == null ? null : { minutes: eta, at: nowMs };
        if (T.shouldSendHeadsUp(ride, eta, rules)) patch.headsUpAt = nowMs;
      }
      if (ride.perks?.liveMap) patch.driverPos = { lat: fix.lat, lng: fix.lng, at: nowMs };
      if (Object.keys(patch).length) tx.update(rideDoc, patch);
    }
    // A dispatcher OK'd him into this zone (his GPS glitched): don't drop him for the approval window.
    const okd = board.approval && board.approval.untilMs > nowMs && board.approval.zoneId === board.zoneId;
    const res = c.applyLocation(
      { status: board.status, zoneId: board.zoneId, outOfZoneSince: l.exists ? l.data().outOfZoneSince : null },
      okd ? board.zoneId : gpsZoneId,
      nowMs,
      GPS.outOfZoneMin
    );
    let boardPatch = res.board ? { ...res.board } : null;
    const currentStatus = boardPatch?.status ?? board.status;
    let parkedSinceMs = board.parkedSinceMs ?? null;
    let parkedZoneId = board.parkedZoneId ?? null;

    if (!boardPatch && currentStatus === c.STATUS.READY && gpsZoneId) {
      const parked = c.parkedAutoPlace(
        { status: currentStatus, zoneId: board.zoneId },
        gpsZoneId,
        nowMs,
        DISPATCH.autoPlaceParkedMin || 2,
        parkedSinceMs,
        parkedZoneId
      );
      parkedSinceMs = parked.parkedSinceMs;
      parkedZoneId = parked.parkedZoneId;
      if (parked.patch) {
        boardPatch = parked.patch;
      }
    }

    const updates = { updatedAt: serverNow() };
    if (boardPatch) Object.assign(updates, boardPatch);
    if (parkedSinceMs !== (board.parkedSinceMs ?? null) || parkedZoneId !== (board.parkedZoneId ?? null)) {
      updates.parkedSinceMs = parkedSinceMs;
      updates.parkedZoneId = parkedZoneId;
    }
    if (Object.keys(updates).length > 1) {
      tx.update(boardRef(uid), updates);
    }

    const status = boardPatch?.status ?? board.status;
    tx.set(locationRef(uid), {
      ...fix,
      zoneId: gpsZoneId,
      at: nowMs,
      live: c.isLive(status),
      outOfZoneSince: res.outOfZoneSince,
    });
    return {
      status,
      zoneId: boardPatch ? (boardPatch.zoneId ?? null) : (board.zoneId ?? null),
      gpsZoneId,
      outOfZoneSince: res.outOfZoneSince,
    };
  });
});

// Off the board → Moving (on the board, not in a line yet).
exports.driverGoOnline = onCall(async (request) => {
  const uid = requireDriver(request);
  const ic = await inspectionCore();
  return changeStatus(uid, request.data, ({ c, board, driver, nowMs }) => {
    const blocked = blockReason(driver, { c, nowMs });
    if (blocked) throw new HttpsError("failed-precondition", blocked);
    // Vehicle inspection: first 360 for this car, weekly, then a quick check each shift.
    const needed = board.status === c.STATUS.OFFLINE ? ic.inspectionNeeded(driver.inspection, driver.carNumber, nowMs) : null;
    if (needed) throw new HttpsError("failed-precondition", ic.NEEDED_MESSAGE[needed], { inspection: needed });
    // Every driver reads and agrees to the current Driver Agreement before driving.
    const agreed =
      driver.agreement?.version === BRANDING.legalVersion && ["driver-agreement", "privacy"].every((x) => (driver.agreement.docs || []).includes(x));
    if (board.status === c.STATUS.OFFLINE && !agreed) {
      throw new HttpsError("failed-precondition", "Read and agree to the Driver Agreement first.", { agreement: true });
    }
    if (board.status !== c.STATUS.OFFLINE) return null; // already on the board
    return { status: c.STATUS.MOVING, zoneId: null, lineKey: null, parkedSinceMs: null, parkedZoneId: null };
  });
});

// Check Ready in the zone the phone is in. Back of that zone's line.
exports.driverCheckReady = onCall(async (request) => {
  const uid = requireDriver(request);
  return changeStatus(uid, request.data, ({ c, board, driver, zones, gpsZoneId, nowMs }) => {
    const blocked = blockReason(driver, { c, nowMs });
    if (blocked) throw new HttpsError("failed-precondition", blocked);
    if (board.status === c.STATUS.OFFERED) throw new HttpsError("failed-precondition", "Answer the call first.");
    if (board.status === c.STATUS.ON_CALL) throw new HttpsError("failed-precondition", "Drop off your fare first.");
    // A weak fix can't place a car: wait for a better one (never fall back to a coarse position).
    const acc = Number(request.data?.accuracy);
    if (!Number.isFinite(acc) || acc > GPS.maxAccuracyMeters) {
      throw new HttpsError(
        "failed-precondition",
        `Waiting for a better GPS signal (${Number.isFinite(acc) ? `\u00b1${Math.round(acc)} m` : "no accuracy reading"}).`,
        { weakGps: true, accuracy: Number.isFinite(acc) ? Math.round(acc) : null }
      );
    }
    if (!gpsZoneId) {
      throw new HttpsError("failed-precondition", "You're not inside a zone. Drive into one, then check ready.");
    }
    const zone = zones.find((z) => z.id === gpsZoneId);
    if (zone?.requiresCert && !c.hasCert(driver, zone.requiresCert, nowMs)) {
      throw new HttpsError("failed-precondition", `${zone.label} is for certified drivers only.`);
    }
    if (board.status === c.STATUS.READY && board.zoneId === gpsZoneId) return null; // keep your spot
    const ready = c.applyCheckReady(gpsZoneId, nowMs);
    return { status: ready.status, zoneId: ready.zoneId, lineKey: ready.lineKey, parkedSinceMs: null, parkedZoneId: null };
  });
});

// Leaving the line on purpose: on the board, no zone.
exports.driverGoMoving = onCall(async (request) => {
  const uid = requireDriver(request);
  return changeStatus(uid, request.data, ({ c, board, driver, nowMs }) => {
    const blocked = blockReason(driver, { c, nowMs });
    if (blocked) throw new HttpsError("failed-precondition", blocked);
    if (board.status === c.STATUS.OFFERED) throw new HttpsError("failed-precondition", "Answer the call first.");
    if (board.status === c.STATUS.ON_CALL) throw new HttpsError("failed-precondition", "Drop off your fare first.");
    if (board.status === c.STATUS.MOVING) return null;
    return { status: c.STATUS.MOVING, zoneId: null, lineKey: null, parkedSinceMs: null, parkedZoneId: null };
  });
});

// Drop Off: the green dot leaves the pickup zone and the driver goes into
// the line where he dropped (front by default: "next up"). Outside every
// zone, or in a zone he isn't certified for, he goes to Moving.
exports.driverDropOff = onCall(async (request) => {
  const uid = requireDriver(request);
  const fix = readFix(request.data);
  const c = await core();
  const zones = await getZones();
  const gpsZoneId = c.zoneForPoint(zones, fix.lng, fix.lat);
  const zone = zones.find((z) => z.id === gpsZoneId);
  const nowMs = Date.now();

  return db().runTransaction(async (tx) => {
    const [b, d] = await Promise.all([tx.get(boardRef(uid)), tx.get(driverRef(uid))]);
    if (!b.exists || !d.exists) throw new HttpsError("failed-precondition", "You're not on the driver roster yet.");
    if (b.data().status !== c.STATUS.ON_CALL) throw new HttpsError("failed-precondition", "You're not on a call.");
    const driver = d.data();
    const rideId = b.data().rideId || null;
    const rideSnap = rideId ? await tx.get(db().collection("rides").doc(rideId)) : null;
    if (rideSnap?.data()?.status === "dispatched" && rideSnap.data().driverId === uid) {
      throw new HttpsError("failed-precondition", "Tap Picked up first. If the rider isn't coming, use \u201cCan't finish this call\u201d.");
    }

    let patch;
    if (blockReason(driver, { c, nowMs })) {
      patch = { status: c.STATUS.OFFLINE, zoneId: null, lineKey: null, parkedSinceMs: null, parkedZoneId: null };
    } else {
      const certOk = !zone?.requiresCert || c.hasCert(driver, zone.requiresCert, nowMs);
      const dropZoneId = certOk ? gpsZoneId : null;
      const line = dropZoneId
        ? (await tx.get(db().collection("board").where("zoneId", "==", dropZoneId))).docs.map((x) => ({
            id: x.id,
            ...x.data(),
          }))
        : [];
      patch = c.applyDropOff(line, uid, dropZoneId, DISPATCH.dropOffPlacement || "front", nowMs);
      patch.parkedSinceMs = null;
      patch.parkedZoneId = null;
    }
    tx.update(boardRef(uid), { ...patch, rideId: null, radioCall: null, updatedAt: serverNow() });
    // The fare is settled the usual way (rider self-checkout or dispatcher).
    const ride = rideSnap?.data();
    if (ride && ride.driverId === uid && ["dispatched", "in_transit"].includes(ride.status)) {
      tx.update(rideSnap.ref, { status: "finished", droppedOffAt: nowMs, dropZoneActualId: gpsZoneId });
    }
    tx.set(db().collection("driverInbox").doc(uid), { current: null }, { merge: true });
    tx.set(locationRef(uid), {
      ...fix,
      zoneId: gpsZoneId,
      at: nowMs,
      live: c.isLive(patch.status),
      outOfZoneSince: null,
    });
    return { status: patch.status, zoneId: patch.zoneId, gpsZoneId };
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
      return { status: c.STATUS.OFFLINE, zoneId: null, lineKey: null, parkedSinceMs: null, parkedZoneId: null };
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
        const okd = b.exists && b.data().approval?.untilMs > nowMs;
        const patch = b.exists && !okd ? c.staleLocationPatch(b.data(), loc.at, nowMs, GPS.staleMin) : null;
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
