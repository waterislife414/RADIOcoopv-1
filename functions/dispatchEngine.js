// Auto-dispatch engine. A pending ride is offered to the requested driver
// (if he's available) or the first eligible red dot in the pickup zone's
// line. The offer pings 3 times, 15 s apart; no answer or a decline takes
// him off the board with a warning (no penalty on requested calls), and the
// next driver gets it. Nobody eligible in the zone → "Need a car in [zone]"
// to every available eligible driver; first tap wins. Nobody takes it in
// broadcastSec → escalated to the dispatcher.
//
// ride.dispatchState: new | scheduled | offering | pending_next | broadcast |
//                     escalated | assigned
// Each driver sees his own offer/broadcasts/current ride in driverInbox/{uid}
// (server-written), so drivers never read the rides collection.
const admin = require("firebase-admin");
const BRANDING = require("./branding.json");
const { getZones } = require("./zoneStore");
const { blockReason } = require("./workRules");
const timers = require("./timers");
const push = require("./push");

const D = BRANDING.dispatch || {};
const OFFER = { pings: 3, pingIntervalSec: 15, broadcastSec: 90, ...(D.offer || {}) };
const INTERVAL_MS = OFFER.pingIntervalSec * 1000;
const EXPIRE_MS = OFFER.pings * INTERVAL_MS;
const MAX_WARNINGS = D.maxWarnings ?? 3;
const TIME_ZONE = D.timeZone || "America/New_York";
const LEAD_MS = (D.scheduledLeadMin ?? 15) * 60 * 1000;

const FieldValue = admin.firestore.FieldValue;
const db = () => admin.firestore();
const serverNow = () => FieldValue.serverTimestamp();
let corePromise = null;
const core = () => (corePromise ||= import("./lib/dispatchCore.mjs"));

const rideRef = (id) => db().collection("rides").doc(id);
const boardRef = (uid) => db().collection("board").doc(uid);
const driverRef = (uid) => db().collection("drivers").doc(uid);
const inboxRef = (uid) => db().collection("driverInbox").doc(uid);

let settingsCache = { at: 0, data: {} };
async function getSettings() {
  if (Date.now() - settingsCache.at < 15_000) return settingsCache.data;
  const s = await db().collection("settings").doc("dispatch").get();
  settingsCache = { at: Date.now(), data: s.data() || {} };
  return settingsCache.data;
}

async function autoNow(nowMs = Date.now()) {
  const c = await core();
  return c.isAutoDispatch(await getSettings(), nowMs, TIME_ZONE);
}

/** What a driver sees about a call before he has it (no rider phone). */
function rideCard(rideId, ride, zones) {
  const label = (id) => zones.find((z) => z.id === id)?.label || null;
  return {
    rideId,
    zoneId: ride.zoneId || null,
    zoneLabel: label(ride.zoneId) || ride.zoneLabel || null,
    dropZoneLabel: label(ride.dropZoneId),
    pickup: ride.pickup || "",
    dropoff: ride.dropoff || "",
    passengers: ride.passengers ?? null,
    wheelchair: !!ride.needsAccessibleVehicle,
    paymentMethod: ride.paymentMethod || null,
  };
}

// Unzoned rides (landmark the geocoder couldn't place) have no line, so they
// go straight to the broadcast; the dispatcher also sees them flagged.
const needTitle = (card) => (card.zoneLabel ? `Need a car in ${card.zoneLabel}` : "Need a car");

/** Fields set on a new ride: when to dispatch it and its priority. */
async function dispatchFieldsFor(ride, nowMs = Date.now()) {
  const c = await core();
  let priority = ride.wantsPriorityPass ? "vip" : null;
  if (ride.customerId && ride.customerId !== "guest") {
    const u = await db().collection("users").doc(ride.customerId).get();
    if (u.data()?.subscriptionTier === "PREMIUM") priority = "premium";
  }
  const fields = { priority, dispatchState: "new", triedDriverIds: [], broadcastTo: [] };
  if (ride.scheduleType === "later") {
    const at = c.parseLocalDateTime(ride.scheduledFor, TIME_ZONE);
    if (at && at - LEAD_MS > nowMs) Object.assign(fields, { dispatchState: "scheduled", dispatchAt: at - LEAD_MS });
  }
  return fields;
}

/**
 * Offer the ride to the next driver, or broadcast it. Safe to call any time:
 * does nothing unless the ride is pending, auto-dispatch is on, and no
 * offer is already out.
 */
async function startDispatch(rideId) {
  const c = await core();
  const [zones, settings] = await Promise.all([getZones(), getSettings()]);
  const nowMs = Date.now();
  if (!c.isAutoDispatch(settings, nowMs, TIME_ZONE)) return null;

  const out = await db().runTransaction(async (tx) => {
    const rs = await tx.get(rideRef(rideId));
    if (!rs.exists) return null;
    const ride = rs.data();
    if (ride.status !== "pending") return null;
    if (["offering", "assigned"].includes(ride.dispatchState)) return null;
    if (ride.dispatchState === "scheduled" && ride.dispatchAt > nowMs) return null;

    const boardSnap = await tx.get(db().collection("board").where("status", "in", ["ready", "moving"]));
    const boards = boardSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const driverSnaps = boards.length ? await tx.getAll(...boards.map((b) => driverRef(b.id))) : [];
    const drivers = [];
    boards.forEach((b, i) => {
      const d = driverSnaps[i].data();
      if (d && !blockReason(d)) drivers.push({ ...d, ...b, id: b.id });
    });
    let vehiclesByCar = {};
    if ((ride.requiresCerts || []).includes("wheelchair")) {
      const v = await tx.get(db().collection("vehicles").where("active", "==", true));
      vehiclesByCar = Object.fromEntries(v.docs.map((x) => [x.id, x.data()]));
    }

    const card = rideCard(rideId, ride, zones);
    const prevBroadcast = ride.broadcastTo || [];
    const pick = c.pickDriverForRide(ride, drivers, vehiclesByCar, nowMs);

    if (pick.driverId) {
      const seq = (ride.offerSeq || 0) + 1;
      const offer = { driverId: pick.driverId, kind: pick.kind, startedAt: nowMs, pings: 1, seq };
      tx.update(rideRef(rideId), {
        dispatchState: "offering",
        offer,
        offerSeq: seq,
        offerDriverId: pick.driverId,
        broadcastTo: [],
      });
      tx.update(boardRef(pick.driverId), { status: c.STATUS.OFFERED, offerRideId: rideId, updatedAt: serverNow() });
      tx.set(
        inboxRef(pick.driverId),
        { offer: { ...card, kind: pick.kind, startedAt: nowMs, expiresAt: nowMs + EXPIRE_MS, pings: 1 } },
        { merge: true }
      );
      prevBroadcast.forEach((uid) =>
        tx.set(inboxRef(uid), { broadcasts: { [rideId]: FieldValue.delete() } }, { merge: true })
      );
      return { offer, card };
    }

    const recipients = c.broadcastRecipients(ride, drivers, vehiclesByCar, nowMs);
    const prev = new Set(prevBroadcast);
    const added = recipients.filter((id) => !prev.has(id));
    const removed = prevBroadcast.filter((id) => !recipients.includes(id));
    const state = ride.dispatchState === "escalated" ? "escalated" : "broadcast";
    const fresh = state === "broadcast" && ride.dispatchState !== "broadcast";
    if (!fresh && !added.length && !removed.length && ride.dispatchState === state) return null;

    tx.update(rideRef(rideId), {
      dispatchState: state,
      broadcastTo: recipients,
      offer: null,
      offerDriverId: null,
      ...(fresh ? { broadcastAt: nowMs } : {}),
    });
    added.forEach((uid) =>
      tx.set(inboxRef(uid), { broadcasts: { [rideId]: { ...card, at: nowMs } } }, { merge: true })
    );
    removed.forEach((uid) =>
      tx.set(inboxRef(uid), { broadcasts: { [rideId]: FieldValue.delete() } }, { merge: true })
    );
    return { broadcast: { added, fresh }, card };
  });

  if (out?.offer) {
    await Promise.all([
      push.toDrivers([out.offer.driverId], {
        title: out.offer.kind === "requested" ? "\u{1F4DE} A rider requested you" : `\u{1F4DE} Call in ${out.card.zoneLabel || "your zone"}`,
        body: out.card.pickup,
        tag: `offer-${rideId}`,
      }),
      timers.after(OFFER.pingIntervalSec, { type: "offer", rideId, seq: out.offer.seq, step: 2 }),
    ]);
  } else if (out?.broadcast) {
    const jobs = [];
    if (out.broadcast.added.length) {
      jobs.push(
        push.toDrivers(out.broadcast.added, {
          title: needTitle(out.card),
          body: out.card.pickup,
          tag: `need-${rideId}`,
        })
      );
    }
    if (out.broadcast.fresh) jobs.push(timers.after(OFFER.broadcastSec, { type: "escalate", rideId }));
    await Promise.all(jobs);
  }
  return out;
}

/** Ping 2..N of an offer, then expiry. Stale timers (offer moved on) do nothing. */
async function offerStep(rideId, seq, step) {
  if (step > OFFER.pings) return resolveOffer(rideId, { seq, reason: "missed" });
  const nowMs = Date.now();
  const sent = await db().runTransaction(async (tx) => {
    const rs = await tx.get(rideRef(rideId));
    const ride = rs.data();
    if (!ride || ride.dispatchState !== "offering" || ride.offer?.seq !== seq) return null;
    tx.update(rideRef(rideId), { "offer.pings": step });
    tx.set(inboxRef(ride.offer.driverId), { offer: { pings: step, lastPingAt: nowMs } }, { merge: true });
    return ride;
  });
  if (!sent) return null;
  await Promise.all([
    push.toDrivers([sent.offer.driverId], {
      title: `\u{1F4DE} Call in ${sent.zoneLabel || "your zone"} (${step} of ${OFFER.pings})`,
      body: sent.pickup || "",
      tag: `offer-${rideId}`,
    }),
    timers.after(OFFER.pingIntervalSec, { type: "offer", rideId, seq, step: step + 1 }),
  ]);
  return sent;
}

/**
 * The offered driver missed or declined. Applies the penalty (none on
 * requested calls), marks him tried, and moves on to the next driver.
 * byDriver: only resolve if this driver holds the offer. seq: only this offer.
 */
async function resolveOffer(rideId, { seq = null, byDriver = null, reason = "missed" } = {}) {
  const c = await core();
  const nowMs = Date.now();
  const res = await db().runTransaction(async (tx) => {
    const rs = await tx.get(rideRef(rideId));
    const ride = rs.data();
    const offer = ride?.offer;
    if (!ride || ride.dispatchState !== "offering" || !offer) return null;
    if (seq != null && offer.seq !== seq) return null;
    if (byDriver && offer.driverId !== byDriver) return null;
    const uid = offer.driverId;
    const [bs, ds] = await Promise.all([tx.get(boardRef(uid)), tx.get(driverRef(uid))]);
    const board = bs.data();
    const result = c.missOutcome({ board: board || {}, driver: ds.data(), kind: offer.kind, reason, now: nowMs, maxWarnings: MAX_WARNINGS });
    if (board?.status === c.STATUS.OFFERED && board.offerRideId === rideId) {
      tx.update(boardRef(uid), { ...result.board, offerRideId: null, updatedAt: serverNow() });
    }
    if (result.driver) tx.update(driverRef(uid), result.driver);
    tx.update(rideRef(rideId), {
      dispatchState: "pending_next",
      offer: null,
      offerDriverId: null,
      triedDriverIds: FieldValue.arrayUnion(uid),
      lastMiss: { driverId: uid, reason, kind: offer.kind, at: nowMs },
    });
    tx.set(inboxRef(uid), { offer: null }, { merge: true });
    return { driverId: uid, kind: offer.kind, ...result };
  });
  if (res) await startDispatch(rideId);
  return res;
}

/**
 * Give the ride to this driver (offer accepted or broadcast claimed).
 * Caller has done all transaction reads; this only writes.
 */
function assignInTx(tx, c, { rideId, ride, uid, board, driver, customer, how, zones, nowMs }) {
  const accept = c.applyAccept(board, ride);
  const riderName =
    [ride.firstName, ride.lastName].filter(Boolean).join(" ") ||
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
    null;
  tx.update(rideRef(rideId), {
    status: "dispatched",
    driverId: uid,
    carNumber: driver.carNumber || board.carNumber || null,
    dispatchState: "assigned",
    assignedAt: nowMs,
    assignedHow: how,
    offer: null,
    offerDriverId: null,
    broadcastTo: [],
  });
  tx.update(boardRef(uid), {
    ...accept,
    rideId,
    offerRideId: null,
    updatedAt: serverNow(),
  });
  tx.set(
    inboxRef(uid),
    {
      offer: null,
      current: {
        ...rideCard(rideId, ride, zones),
        status: "dispatched",
        riderName,
        riderPhone: ride.phone || customer?.phone || null,
        pickupLat: ride.pickupLat ?? null,
        pickupLng: ride.pickupLng ?? null,
        dropLat: ride.dropLat ?? null,
        dropLng: ride.dropLng ?? null,
        assignedAt: nowMs,
      },
    },
    { merge: true }
  );
  (ride.broadcastTo || []).forEach((other) =>
    tx.set(inboxRef(other), { broadcasts: { [rideId]: FieldValue.delete() } }, { merge: true })
  );
}

/** Nobody took the broadcast in time: flag it for the dispatcher (drivers can still take it). */
async function escalate(rideId) {
  return db().runTransaction(async (tx) => {
    const rs = await tx.get(rideRef(rideId));
    const ride = rs.data();
    if (!ride || ride.status !== "pending" || ride.dispatchState !== "broadcast") return false;
    tx.update(rideRef(rideId), { dispatchState: "escalated", escalatedAt: Date.now(), escalateReason: "no_taker" });
    return true;
  });
}

/** Rides waiting for a car, best first (Premium, VIP, then oldest). */
async function waitingRides(states) {
  const c = await core();
  const snap = await db()
    .collection("rides")
    .where("status", "==", "pending")
    .where("dispatchState", "in", states)
    .get();
  return c.sortPendingRides(
    snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().timestamp?.toMillis?.() ?? 0 }))
  );
}

module.exports = {
  OFFER,
  EXPIRE_MS,
  TIME_ZONE,
  core,
  getSettings,
  autoNow,
  rideCard,
  dispatchFieldsFor,
  startDispatch,
  offerStep,
  resolveOffer,
  assignInTx,
  escalate,
  waitingRides,
  refs: { rideRef, boardRef, driverRef, inboxRef },
  _resetSettingsCache: () => (settingsCache = { at: 0, data: {} }),
};
