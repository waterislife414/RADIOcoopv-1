// Dispatcher controls: dispatch mode (manual / auto / scheduled), assigning
// a ride to a car by hand, fixing a ride's zone, moving cars on the board,
// and radio-only cars (drivers without the app) that the dispatcher keeps
// on the board himself. Auto-dispatch skips radio-only cars.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const E = require("./dispatchEngine");
const { getZones } = require("./zoneStore");
const push = require("./push");

const FieldValue = admin.firestore.FieldValue;
const db = () => admin.firestore();
const serverNow = () => FieldValue.serverTimestamp();
const { rideRef, boardRef, driverRef, inboxRef } = E.refs;

function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Dispatcher access required.");
  }
  return request.auth.uid;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const back = (b) => (b.zoneId ? "ready" : "moving");

exports.setDispatchMode = onCall(async (request) => {
  const by = requireAdmin(request);
  const mode = request.data?.mode;
  if (!["manual", "auto", "scheduled"].includes(mode)) throw new HttpsError("invalid-argument", "Pick manual, auto or scheduled.");
  const windows = (Array.isArray(request.data?.windows) ? request.data.windows : []).slice(0, 14).map((w) => {
    const days = [...new Set((w.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    if (!HHMM.test(w.start) || !HHMM.test(w.end) || w.start === w.end || !days.length) {
      throw new HttpsError("invalid-argument", "Each time window needs days, a start and an end.");
    }
    return { days, start: w.start, end: w.end };
  });
  if (mode === "scheduled" && !windows.length) throw new HttpsError("invalid-argument", "Add at least one time window.");
  await db().collection("settings").doc("dispatch").set({ mode, windows, updatedAt: serverNow(), updatedBy: by });
  E._resetSettingsCache();

  let started = 0;
  if (await E.autoNow()) {
    for (const r of await E.waitingRides(["new", "pending_next", "broadcast", "escalated"])) {
      if (await E.startDispatch(r.id)) started++;
    }
  }
  return { ok: true, autoNow: await E.autoNow(), started };
});

/**
 * Give a ride to a car (or mark it dispatched with no car, the old way).
 * Cancels any offer or broadcast out on it. Also reassigns a dispatched ride.
 * force: assign even if the car lacks a certification/van the ride needs.
 */
exports.dispatcherAssign = onCall(async (request) => {
  requireAdmin(request);
  const rideId = String(request.data?.rideId || "");
  const uid = request.data?.uid ? String(request.data.uid) : null;
  const force = request.data?.force === true;
  if (!rideId) throw new HttpsError("invalid-argument", "Missing ride.");
  const c = await E.core();
  const zones = await getZones();
  const nowMs = Date.now();

  const out = await db().runTransaction(async (tx) => {
    const rs = await tx.get(rideRef(rideId));
    const ride = rs.data();
    if (!ride) throw new HttpsError("not-found", "Ride not found.");
    if (!["pending", "dispatched"].includes(ride.status)) {
      throw new HttpsError("failed-precondition", "This ride is already under way.");
    }
    const offered = ride.status === "pending" ? ride.offer?.driverId || null : null;
    const previous = ride.status === "dispatched" ? ride.driverId || null : null;
    if (uid && previous === uid) return { unchanged: true };

    const [ob, pb, tb, td, vs] = await Promise.all([
      offered && offered !== uid ? tx.get(boardRef(offered)) : null,
      previous ? tx.get(boardRef(previous)) : null,
      uid ? tx.get(boardRef(uid)) : null,
      uid ? tx.get(driverRef(uid)) : null,
      uid && (ride.requiresCerts || []).includes("wheelchair") ? tx.get(db().collection("vehicles")) : null,
    ]);
    const customer =
      uid && ride.customerId && ride.customerId !== "guest"
        ? (await tx.get(db().collection("users").doc(ride.customerId))).data() || null
        : null;

    let board = null;
    let driver = null;
    if (uid) {
      if (!tb.exists) throw new HttpsError("not-found", "That car isn't on the roster.");
      board = tb.data();
      driver = td.exists ? td.data() : { carNumber: board.carNumber, certs: {} };
      if (board.status === "on_call") throw new HttpsError("failed-precondition", `Car ${board.carNumber} already has a fare.`);
      if (board.status === "offered" && board.offerRideId !== rideId) {
        throw new HttpsError("failed-precondition", `Car ${board.carNumber} is being offered another call. Try again in a few seconds.`);
      }
      if (!force && !board.radioOnly) {
        const vehiclesByCar = vs ? Object.fromEntries(vs.docs.map((v) => [v.id, v.data()])) : {};
        if (!c.isEligible({ ...driver, ...board }, ride, vehiclesByCar, nowMs)) {
          throw new HttpsError("failed-precondition", `NEEDS_FORCE: Car ${board.carNumber} doesn't have the certification or van this ride needs.`);
        }
      }
    }

    // Writes
    if (ob?.exists && ob.data().status === "offered" && ob.data().offerRideId === rideId) {
      tx.update(boardRef(offered), { status: back(ob.data()), offerRideId: null, updatedAt: serverNow() });
      tx.set(inboxRef(offered), { offer: null }, { merge: true });
    }
    if (pb?.exists && pb.data().status === "on_call" && pb.data().rideId === rideId) {
      tx.update(boardRef(previous), {
        status: back(pb.data()),
        rideId: null,
        lastEvent: { type: "ride_cancelled", at: nowMs },
        updatedAt: serverNow(),
      });
      tx.set(inboxRef(previous), { current: null }, { merge: true });
    }
    if (uid) {
      E.assignInTx(tx, c, { rideId, ride, uid, board, driver, customer, how: "dispatcher", zones, nowMs });
      return { uid, carNumber: board.carNumber, app: !board.radioOnly };
    }
    tx.update(rideRef(rideId), {
      status: "dispatched",
      dispatchState: "manual",
      offer: null,
      offerDriverId: null,
      broadcastTo: [],
    });
    (ride.broadcastTo || []).forEach((id) =>
      tx.set(inboxRef(id), { broadcasts: { [rideId]: FieldValue.delete() } }, { merge: true })
    );
    return { uid: null };
  });

  if (out.app) {
    await push.toDrivers([out.uid], { title: "\u{1F695} Dispatch gave you a call", body: "Open the app for the pickup.", tag: `assigned-${rideId}` });
  }
  return { ok: true, carNumber: out.carNumber ?? null };
});

// Place (or re-place) a ride's pickup zone by hand; auto-dispatch takes it from there.
exports.dispatcherSetRideZone = onCall(async (request) => {
  requireAdmin(request);
  const rideId = String(request.data?.rideId || "");
  const zoneId = String(request.data?.zoneId || "");
  const c = await E.core();
  const zones = await getZones();
  const zone = zones.find((z) => z.id === zoneId);
  if (!rideId || !zone) throw new HttpsError("invalid-argument", "Pick a zone.");
  const ride = (await rideRef(rideId).get()).data();
  if (!ride || ride.status !== "pending") throw new HttpsError("failed-precondition", "Only waiting rides can be re-zoned.");
  const requiresCerts = c.requiredCertsForRide({
    pickupZone: zone,
    dropZone: zones.find((z) => z.id === ride.dropZoneId),
    wheelchair: !!ride.needsAccessibleVehicle,
  });
  await rideRef(rideId).update({ zoneId, zoneLabel: zone.label, requiresCerts, zoneSetBy: "dispatcher" });
  if (ride.dispatchState !== "offering" && ride.dispatchState !== "scheduled") {
    if (ride.dispatchState === "escalated") await rideRef(rideId).update({ dispatchState: "pending_next" });
    await E.startDispatch(rideId);
  }
  return { ok: true };
});

// Move a car on the board by hand. On a car with a fare, this is a drop-off
// done for him (the ride is marked finished).
exports.dispatcherBoardAction = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const action = String(request.data?.action || "");
  const zoneId = request.data?.zoneId ? String(request.data.zoneId) : null;
  const c = await E.core();
  const zones = await getZones();
  if (["ready", "front"].includes(action) && !zones.some((z) => z.id === zoneId)) {
    throw new HttpsError("invalid-argument", "Pick a zone.");
  }
  if (!["ready", "front", "moving", "off", "remove"].includes(action)) throw new HttpsError("invalid-argument", "Unknown action.");
  const nowMs = Date.now();

  return db().runTransaction(async (tx) => {
    const bs = await tx.get(boardRef(uid));
    if (!bs.exists) throw new HttpsError("not-found", "Car not found.");
    const board = bs.data();
    if (board.status === "offered") throw new HttpsError("failed-precondition", "That car is being offered a call. Wait for his answer.");
    if (action === "remove") {
      if (!board.radioOnly) throw new HttpsError("failed-precondition", "Only radio cars can be removed. Use Off the board.");
      if (board.status === "on_call") throw new HttpsError("failed-precondition", "Drop off his fare first.");
      tx.delete(boardRef(uid));
      return { ok: true };
    }
    const line = zoneId ? (await tx.get(db().collection("board").where("zoneId", "==", zoneId))).docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    const rideSnap = board.status === "on_call" && board.rideId ? await tx.get(rideRef(board.rideId)) : null;

    const patch = c.dispatcherMove(line, uid, action, zoneId, nowMs);
    tx.update(boardRef(uid), { ...patch, rideId: null, updatedAt: serverNow(), movedByDispatcherAt: nowMs });
    const ride = rideSnap?.data();
    if (ride && ["dispatched", "in_transit"].includes(ride.status) && ride.driverId === uid) {
      tx.update(rideSnap.ref, { status: "finished", droppedOffAt: nowMs, droppedOffBy: "dispatcher" });
    }
    if (!board.radioOnly) {
      if (board.status === "on_call") tx.set(inboxRef(uid), { current: null }, { merge: true });
      tx.set(db().collection("driverLocations").doc(uid), { live: c.isLive(patch.status), outOfZoneSince: null }, { merge: true });
    }
    return { ok: true, status: patch.status };
  });
});

// A car whose driver doesn't use the app. Dispatcher keeps it on the board.
exports.addRadioCar = onCall(async (request) => {
  requireAdmin(request);
  const car = String(request.data?.carNumber || "").trim();
  const zoneId = String(request.data?.zoneId || "");
  if (!/^[A-Za-z0-9-]{1,6}$/.test(car)) throw new HttpsError("invalid-argument", "Car number must be 1-6 letters/numbers.");
  const zones = await getZones();
  if (!zones.some((z) => z.id === zoneId)) throw new HttpsError("invalid-argument", "Pick a zone.");
  const taken = await db().collection("board").where("carNumber", "==", car).limit(1).get();
  if (!taken.empty) throw new HttpsError("already-exists", `Car ${car} is already on the board.`);
  const id = `radio-${car}`;
  await boardRef(id).set({
    carNumber: car,
    radioOnly: true,
    status: "ready",
    zoneId,
    lineKey: Date.now(),
    updatedAt: serverNow(),
  });
  return { ok: true, uid: id };
});
