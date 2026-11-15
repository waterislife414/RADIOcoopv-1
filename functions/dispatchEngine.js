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
const { callingConfigured } = require("./calling");
const { getZones } = require("./zoneStore");
const { blockReason, INCENTIVES } = require("./workRules");
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
let timingPromise = null;
const timing = () => (timingPromise ||= import("./lib/rideTiming.mjs"));
// Same rule as rideTiming.isAppRide (kept in sync by tests): booked in the
// app by a signed-in rider sharing location. Call-in and guest rides pay no fees.
const isAppRide = (r) =>
  typeof r.appHandled === "boolean" ? r.appHandled : !(r.source === "phone" || r.callIn) && !!r.customerId && r.customerId !== "guest";

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
    notes: ride.notes || null,
  };
}

// Unzoned rides (landmark the geocoder couldn't place) have no line, so they
// go straight to the broadcast; the dispatcher also sees them flagged.
const needTitle = (card) => (card.zoneLabel ? `Need a car in ${card.zoneLabel}` : "Need a car");

const APP_HANDLES = { requireAccount: true, requireVerifiedId: true, requireLocation: true, requireCardOrWallet: true, ...(BRANDING.rideRules?.appHandles || {}) };

/** Why an app booking goes to the dispatcher instead of running on its own ([] = the app handles it). */
function officeReasons(ride, user, termsOk) {
  const why = [];
  const member = !!ride.customerId && ride.customerId !== "guest";
  if (APP_HANDLES.requireAccount && !member) why.push("guest");
  if (APP_HANDLES.requireVerifiedId && member && user?.idVerified !== true) why.push("id");
  if (APP_HANDLES.requireLocation && (ride.callIn || ride.shareLocation === false)) why.push("location");
  const paid = (ride.paymentMethod === "card" && !!ride.paymentIntentId) || ride.paymentMethod === "wallet";
  if (APP_HANDLES.requireCardOrWallet && !paid) why.push("cash");
  if (!termsOk) why.push("terms");
  return why;
}

/** Pickup-clock fields cleared whenever a ride gets a new driver (or goes back to waiting). */
const PICKUP_RESET = Object.freeze({
  arrivedAt: null,
  arrivedDistM: null,
  arrivedFix: null,
  arrivedNear: null,
  headsUpAt: null,
  eta: null,
  riderReply: null,
  driverPos: null,
  waitedMs: null,
});

/** Fields set on a new ride: when to dispatch it and its priority. */
async function dispatchFieldsFor(ride, nowMs = Date.now(), rideId = null) {
  const c = await core();
  const T = await timing();
  // Day Pass priority only when it's paid, or the ride's card pays it at the end.
  const cardRide = ride.paymentMethod === "card" && !!ride.paymentIntentId;
  let priority = null;
  let tier = null;
  let user = null;
  if (ride.customerId && ride.customerId !== "guest") {
    user = (await db().collection("users").doc(ride.customerId).get()).data() || null;
    tier = user?.subscriptionTier || null;
    if (tier === "PREMIUM") priority = "premium";
  }
  let dayPass = false;
  if (ride.fastPassId) {
    const p = await db().collection("fast_passes").doc(String(ride.fastPassId)).get();
    dayPass = T.isDayPassValid(p.data(), ride.customerId, rideId, nowMs);
  }
  if (priority !== "premium" && ride.wantsPriorityPass && (dayPass || cardRide)) priority = "vip";
  const fields = {
    priority,
    dispatchState: "new",
    triedDriverIds: [],
    broadcastTo: [],
    perks: T.perksFor({ tier, dayPass }, BRANDING.ridePerks || {}),
    // The office marks riders who need extra time getting to the car: no wait or no-show fees.
    extraTime: user?.extraTime === true,
  };
  // Everyone agrees to the terms. App bookings carry the agreement; a
  // dispatcher ticks "read the ride rules" on phone calls.
  const termsOk = ride.source === "phone" ? ride.termsRead === true : ride.consent?.version === BRANDING.legalVersion;
  if (!termsOk) fields.termsMissing = true;
  // The app runs a ride on its own (rider and driver work it out) only for a
  // signed-in, ID-verified rider sharing GPS and paying by card or account
  // balance. Everything else is a call-in ride the dispatcher sends by radio.
  // Phone calls stay the dispatcher's own (he entered them, he decides).
  if (ride.source === "phone") {
    fields.appHandled = false;
  } else {
    const why = officeReasons(ride, user, termsOk);
    fields.appHandled = why.length === 0;
    if (why.length) {
      fields.dispatchState = "office";
      fields.officeWhy = why;
      return fields;
    }
  }
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
    if (["offering", "assigned", "office"].includes(ride.dispatchState)) return null;
    if (ride.dispatchState === "scheduled" && ride.dispatchAt > nowMs) return null;

    const boardSnap = await tx.get(db().collection("board").where("status", "in", ["ready", "moving"]));
    const boards = boardSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const driverSnaps = boards.length ? await tx.getAll(...boards.map((b) => driverRef(b.id))) : [];
    const drivers = [];
    boards.forEach((b, i) => {
      const d = driverSnaps[i].data();
      // A driver on a low-score hold stays on the board but gets no app calls.
      if (d && !blockReason(d, { c, nowMs }) && !(d.callHoldUntil > nowMs)) drivers.push({ ...d, ...b, id: b.id });
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
    const driverDoc = ds.data() || {};
    // Warnings count only strikes still on his record (60 days, since last cleared).
    const before = c.standing(driverDoc, nowMs, INCENTIVES);
    const result = c.missOutcome({ board: board || {}, driver: { ...driverDoc, warnings: before.warnings }, kind: offer.kind, reason, now: nowMs, maxWarnings: MAX_WARNINGS });
    if (result.driver) {
      const after = c.standing({ ...driverDoc, recentStrikes: [...before.recentStrikes, nowMs] }, nowMs, INCENTIVES);
      Object.assign(result.driver, after);
      const hold = c.callHoldUntil(after.score, nowMs, INCENTIVES);
      if (hold) result.driver.callHoldUntil = hold;
      const expiresAt = nowMs + INCENTIVES.scoreWindowDays * 86400000;
      const record = driverRef(uid).collection("record");
      tx.set(record.doc(), { type: reason === "declined" ? "declined" : "missed_call", at: nowMs, expiresAt, points: INCENTIVES.scoreStrikePoints, rideId, source: "app" });
      if (result.driver.status === "suspended") {
        tx.set(record.doc(), { type: "write_up", at: nowMs + 1, expiresAt, points: 0, source: "app", note: `${after.warnings} warnings: off the board until the office reinstates you.` });
      }
    }
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
    // A new driver starts his own pickup clock.
    ...PICKUP_RESET,
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
        // With private calling set up, drivers call through the company line
        // and never see the rider's real number.
        riderPhone: callingConfigured() ? null : ride.phone || customer?.phone || null,
        riderPhoneLast4: String(ride.phone || customer?.phone || "").replace(/\D/g, "").slice(-4) || null,
        pickupLat: ride.pickupLat ?? null,
        pickupLng: ride.pickupLng ?? null,
        dropLat: ride.dropLat ?? null,
        dropLng: ride.dropLng ?? null,
        bookedFrom: ride.bookedFrom ?? null,
        riderPos: ride.riderPos ?? null,
        appRide: isAppRide(ride),
        cardHold: ride.paymentMethod === "card" && !!ride.paymentIntentId,
        extraTime: !!(ride.extraTime || ride.needsAccessibleVehicle),
        assignedAt: nowMs,
        how,
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
  _isAppRide: isAppRide,
  PICKUP_RESET,
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
