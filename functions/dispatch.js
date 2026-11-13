// Auto-dispatch endpoints: driver answers (accept / decline / take a
// broadcast / picked up), timers, triggers, and the minute sweep.
// The engine itself is in dispatchEngine.js.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const E = require("./dispatchEngine");
const { getZones } = require("./zoneStore");
const { requireDriver, blockReason } = require("./workRules");

const FieldValue = admin.firestore.FieldValue;
const db = () => admin.firestore();
const { rideRef, boardRef, driverRef, inboxRef } = E.refs;

function rideIdFrom(request) {
  const id = String(request.data?.rideId || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpsError("invalid-argument", "Missing ride.");
  return id;
}

async function customerFor(tx, ride) {
  if (!ride.customerId || ride.customerId === "guest") return null;
  return (await tx.get(db().collection("users").doc(ride.customerId))).data() || null;
}

exports.acceptOffer = onCall(async (request) => {
  const uid = requireDriver(request);
  const rideId = rideIdFrom(request);
  const c = await E.core();
  const zones = await getZones();
  const nowMs = Date.now();
  return db().runTransaction(async (tx) => {
    const [rs, bs, ds] = await Promise.all([tx.get(rideRef(rideId)), tx.get(boardRef(uid)), tx.get(driverRef(uid))]);
    const ride = rs.data();
    if (!ride || ride.status !== "pending" || ride.dispatchState !== "offering" || ride.offer?.driverId !== uid) {
      throw new HttpsError("failed-precondition", "That call is no longer yours.");
    }
    const customer = await customerFor(tx, ride);
    E.assignInTx(tx, c, { rideId, ride, uid, board: bs.data(), driver: ds.data(), customer, how: ride.offer.kind, zones, nowMs });
    return { ok: true };
  });
});

exports.declineOffer = onCall(async (request) => {
  const uid = requireDriver(request);
  const rideId = rideIdFrom(request);
  const res = await E.resolveOffer(rideId, { byDriver: uid, reason: "declined" });
  if (!res) throw new HttpsError("failed-precondition", "That call is no longer yours.");
  return { ok: true, penalized: !!res.driver, warnings: res.driver?.warnings ?? null };
});

// "Need a car in [zone]": first driver to tap gets it.
exports.claimBroadcast = onCall(async (request) => {
  const uid = requireDriver(request);
  const rideId = rideIdFrom(request);
  const c = await E.core();
  const zones = await getZones();
  const nowMs = Date.now();
  const res = await db().runTransaction(async (tx) => {
    const [rs, bs, ds] = await Promise.all([tx.get(rideRef(rideId)), tx.get(boardRef(uid)), tx.get(driverRef(uid))]);
    const ride = rs.data();
    const board = bs.data();
    const driver = ds.data();
    if (
      !ride ||
      ride.status !== "pending" ||
      !["broadcast", "escalated"].includes(ride.dispatchState) ||
      !(ride.broadcastTo || []).includes(uid)
    ) {
      return { gone: true };
    }
    const blocked = blockReason(driver);
    if (blocked) throw new HttpsError("failed-precondition", blocked);
    if (!board || !["ready", "moving"].includes(board.status)) {
      throw new HttpsError("failed-precondition", "You need to be on the board and free to take a call.");
    }
    let vehiclesByCar = {};
    if ((ride.requiresCerts || []).includes("wheelchair")) {
      const v = await tx.get(db().collection("vehicles").doc(String(driver.carNumber)));
      if (v.exists) vehiclesByCar = { [driver.carNumber]: v.data() };
    }
    if (!c.isEligible({ ...driver, ...board }, ride, vehiclesByCar, nowMs)) {
      throw new HttpsError("failed-precondition", "This call needs a certification or van you don't have.");
    }
    const customer = await customerFor(tx, ride);
    E.assignInTx(tx, c, { rideId, ride, uid, board, driver, customer, how: "broadcast", zones, nowMs });
    return { ok: true };
  });
  if (res.gone) {
    await inboxRef(uid).set({ broadcasts: { [rideId]: FieldValue.delete() } }, { merge: true });
    throw new HttpsError("failed-precondition", "Another car already took it.");
  }
  return res;
});

exports.driverPickedUp = onCall(async (request) => {
  const uid = requireDriver(request);
  const rideId = rideIdFrom(request);
  return db().runTransaction(async (tx) => {
    const rs = await tx.get(rideRef(rideId));
    const ride = rs.data();
    if (!ride || ride.driverId !== uid) throw new HttpsError("failed-precondition", "That isn't your call.");
    if (ride.status !== "dispatched") return { ok: true, status: ride.status };
    tx.update(rideRef(rideId), { status: "in_transit", pickedUpAt: Date.now() });
    tx.set(inboxRef(uid), { current: { status: "in_transit" } }, { merge: true });
    return { ok: true, status: "in_transit" };
  });
});

// Phone alerts: the driver's app registers its push token here.
exports.registerPushToken = onCall(async (request) => {
  const uid = requireDriver(request);
  const token = String(request.data?.token || "");
  if (token.length < 20 || token.length > 4096) throw new HttpsError("invalid-argument", "Bad token.");
  await db()
    .collection("driverTokens")
    .doc(uid)
    .set({ tokens: FieldValue.arrayUnion(token), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

// 15-second pings, 45-second expiry, broadcast escalation (Cloud Tasks).
exports.dispatchTimer = onTaskDispatched(
  { retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 }, rateLimits: { maxConcurrentDispatches: 20 } },
  async (req) => {
    const { type, rideId, seq, step } = req.data || {};
    if (type === "offer") await E.offerStep(rideId, seq, step);
    else if (type === "escalate") await E.escalate(rideId);
  }
);

// A driver just became free (checked ready, dropped off, came online):
// waiting calls get another look, best first.
exports.onDriverAvailable = onDocumentUpdated("board/{uid}", async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const free = (s) => s === "ready" || s === "moving";
  if (!free(after.status) || (free(before.status) && before.zoneId === after.zoneId)) return;
  if (!(await E.autoNow())) return;
  const rides = await E.waitingRides(["broadcast", "escalated", "pending_next"]);
  for (const r of rides) await E.startDispatch(r.id);
});

// Dispatcher dismissed a ride: free whoever had it.
exports.onRideDeleted = onDocumentDeleted("rides/{rideId}", async (event) => {
  const ride = event.data?.data();
  const rideId = event.params.rideId;
  if (!ride) return;
  const nowMs = Date.now();
  await db().runTransaction(async (tx) => {
    const offered = ride.offer?.driverId || null;
    const assigned = ride.driverId || null;
    const [ob, ab] = await Promise.all([
      offered ? tx.get(boardRef(offered)) : null,
      assigned ? tx.get(boardRef(assigned)) : null,
    ]);
    const back = (b) => (b.zoneId ? "ready" : "moving");
    if (ob?.exists && ob.data().status === "offered" && ob.data().offerRideId === rideId) {
      tx.update(boardRef(offered), { status: back(ob.data()), offerRideId: null, updatedAt: FieldValue.serverTimestamp() });
      tx.set(inboxRef(offered), { offer: null }, { merge: true });
    }
    if (ab?.exists && ab.data().status === "on_call" && ab.data().rideId === rideId) {
      tx.update(boardRef(assigned), {
        status: back(ab.data()),
        rideId: null,
        lastEvent: { type: "ride_cancelled", at: nowMs },
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(inboxRef(assigned), { current: null }, { merge: true });
    }
    (ride.broadcastTo || []).forEach((uid) =>
      tx.set(inboxRef(uid), { broadcasts: { [rideId]: FieldValue.delete() } }, { merge: true })
    );
  });
});

// Once a minute: catch anything a lost timer missed, release scheduled
// rides when they're due, and pick up rides that came in while dispatch was
// manual. Each query returns nothing on a normal minute (one read each).
exports.dispatchSweep = onSchedule({ schedule: "every 1 minutes", timeZone: E.TIME_ZONE }, async () => {
  const nowMs = Date.now();
  const grace = 20_000;

  const offering = await db().collection("rides").where("dispatchState", "==", "offering").get();
  for (const d of offering.docs) {
    const o = d.data().offer;
    if (o && nowMs - o.startedAt > E.EXPIRE_MS + grace) await E.resolveOffer(d.id, { seq: o.seq, reason: "missed" });
  }

  const broadcasting = await db().collection("rides").where("dispatchState", "==", "broadcast").get();
  for (const d of broadcasting.docs) {
    if (nowMs - (d.data().broadcastAt || 0) > E.OFFER.broadcastSec * 1000 + grace) await E.escalate(d.id);
  }

  if (!(await E.autoNow(nowMs))) return null;
  const due = await E.waitingRides(["new", "scheduled", "pending_next"]);
  for (const r of due) {
    if (r.dispatchState === "scheduled" && r.dispatchAt > nowMs) continue;
    await E.startDispatch(r.id);
  }
  return null;
});
