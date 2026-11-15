// Driver safety and call problems:
//   driverEmergency - SOS: alerts the office with where the car is (the app also dials 911)
//   driverEndCall   - can't finish a call: reason + note; the ride is cancelled,
//                     ended or sent to another car; out of gas adds 2 warnings
//   ackAlert        - the office marks an alert handled
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const BRANDING = require("./branding.json");
let timingPromise = null;
const timing = () => (timingPromise ||= import("./lib/rideTiming.mjs"));
const { requireDriver, INCENTIVES } = require("./workRules");
const E = require("./dispatchEngine");

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const MAX_WARNINGS = (BRANDING.dispatch || {}).maxWarnings ?? 3;
const db = () => admin.firestore();
const FieldValue = admin.firestore.FieldValue;
let issuesPromise = null;
const issues = () => (issuesPromise ||= import("./lib/callIssues.mjs"));

function optionalFix(data) {
  const lat = Number(data?.lat);
  const lng = Number(data?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

exports.driverEmergency = onCall(async (request) => {
  const uid = requireDriver(request);
  const fix = optionalFix(request.data);
  const [d, b] = await Promise.all([db().collection("drivers").doc(uid).get(), db().collection("board").doc(uid).get()]);
  const driver = d.data() || {};
  const ref = db().collection("alerts").doc();
  await ref.set({
    type: "emergency",
    label: request.data?.called911 ? "EMERGENCY — driver is calling 911" : "EMERGENCY — driver needs help",
    note: typeof request.data?.note === "string" ? request.data.note.slice(0, 300) : "",
    driverId: uid,
    driverName: driver.name || "",
    carNumber: driver.carNumber || null,
    rideId: b.data()?.rideId || null,
    lat: fix?.lat ?? null,
    lng: fix?.lng ?? null,
    at: Date.now(),
    status: "open",
  });
  return { id: ref.id };
});

exports.driverEndCall = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const uid = requireDriver(request);
  const ix = await issues();
  const c = await E.core();
  const rideId = String(request.data?.rideId || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(rideId)) throw new HttpsError("invalid-argument", "Missing call.");
  const fix = optionalFix(request.data);
  const nowMs = Date.now();
  const rideRef = db().collection("rides").doc(rideId);
  const boardRef = db().collection("board").doc(uid);
  const driverRef = db().collection("drivers").doc(uid);

  const out = await db().runTransaction(async (tx) => {
    const [rs, ds] = await Promise.all([tx.get(rideRef), tx.get(driverRef)]);
    const ride = rs.data();
    if (!ride || ride.driverId !== uid || !["dispatched", "in_transit"].includes(ride.status)) {
      throw new HttpsError("failed-precondition", "That isn't your call anymore.");
    }
    const check = ix.validateEndCall(request.data, ride.status);
    if (check.error) throw new HttpsError("invalid-argument", check.error);
    const v = check.value;
    // No-show on an app ride: only after 7 minutes at the pickup; the rider
    // pays the no-show fee when the driver was really there. Call-in rides: as always.
    let noShowFeeCents = 0;
    if (v.reason === "no_show") {
      const T = await timing();
      const ns = T.noShowCheck(ride, nowMs, T.rulesFrom(BRANDING.rideRules));
      if (!ns.allowed) throw new HttpsError("failed-precondition", ns.error);
      noShowFeeCents = ns.feeCents;
    }
    const outcome = ix.rideOutcome(v.reason, ride.status);
    const driver = ds.data() || {};
    const report = { reason: v.reason, label: v.label, note: v.note, by: uid, at: nowMs, stage: ride.status };

    // The ride.
    if (outcome === "cancel") {
      tx.update(rideRef, { status: "cancelled", cancelledBy: "driver", endReport: report });
    } else if (outcome === "finish") {
      tx.update(rideRef, { status: "finished", droppedOffAt: nowMs, unpaid: true, endReport: report });
    } else if (outcome === "redispatch") {
      tx.update(rideRef, {
        status: "pending",
        driverId: null,
        carNumber: null,
        dispatchState: "pending_next",
        triedDriverIds: FieldValue.arrayUnion(uid),
        endReport: report,
      });
    } else {
      // Rider is in the car: the office sends another car to where they are.
      tx.update(rideRef, {
        status: "pending",
        driverId: null,
        carNumber: null,
        dispatchState: "escalated",
        triedDriverIds: FieldValue.arrayUnion(uid),
        endReport: report,
        pickupNote: `Rider is waiting with car ${driver.carNumber || ""}${fix ? ` at ${fix.lat.toFixed(5)},${fix.lng.toFixed(5)}` : ""}.`,
        ...(fix ? { pickupLat: fix.lat, pickupLng: fix.lng } : {}),
      });
    }

    // The driver: back on the road, or off the board when the car is out of service.
    let suspended = false;
    const driverPatch = {};
    if (v.warnings > 0) {
      const before = c.standing(driver, nowMs, INCENTIVES);
      const strikes = [...before.recentStrikes, ...Array.from({ length: v.warnings }, (_, i) => nowMs + i)];
      const after = c.standing({ ...driver, recentStrikes: strikes }, nowMs, INCENTIVES);
      Object.assign(driverPatch, after);
      const hold = c.callHoldUntil(after.score, nowMs, INCENTIVES);
      if (hold) driverPatch.callHoldUntil = hold;
      suspended = after.warnings >= MAX_WARNINGS;
      if (suspended) driverPatch.status = "suspended";
    }
    const expiresAt = nowMs + INCENTIVES.scoreWindowDays * 86400000;
    const record = driverRef.collection("record");
    tx.set(record.doc(), {
      type: "call_ended", reason: v.reason, label: v.label, at: nowMs, expiresAt, rideId, source: "app", note: v.note,
      points: v.warnings * INCENTIVES.scoreStrikePoints, warnings: v.warnings,
    });
    if (suspended) {
      tx.set(record.doc(), { type: "write_up", at: nowMs + v.warnings, expiresAt, points: 0, source: "app", note: `${driverPatch.warnings} warnings: off the board until the office reinstates you.` });
    }
    if (Object.keys(driverPatch).length) tx.update(driverRef, driverPatch);

    const offline = v.board === "offline" || suspended;
    tx.set(
      boardRef,
      {
        status: offline ? c.STATUS.OFFLINE : c.STATUS.MOVING,
        zoneId: null,
        lineKey: null,
        rideId: null,
        lastEvent: { type: "call_ended", reason: v.reason, at: nowMs, warnings: driverPatch.warnings ?? null, suspended },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(db().collection("driverInbox").doc(uid), { current: null }, { merge: true });
    // Off the board means off the dispatcher's live map too.
    tx.set(db().collection("driverLocations").doc(uid), { live: !offline, ...(fix ? { ...fix, at: nowMs } : {}) }, { merge: true });

    // The office hears about it.
    if (v.alert || outcome === "office") {
      tx.set(db().collection("alerts").doc(), {
        type: outcome === "office" ? "send_car" : "call_ended",
        label: outcome === "office" ? `${v.label} with a rider in the car — send another car` : v.label,
        note: v.note,
        reason: v.reason,
        driverId: uid,
        driverName: driver.name || "",
        carNumber: driver.carNumber || null,
        rideId,
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        at: nowMs,
        status: "open",
      });
    }
    // Car trouble goes on the shop board.
    if (v.repair && driver.carNumber) {
      tx.set(db().collection("work_orders").doc(), {
        item: v.repair, description: `${v.label}: ${v.note}`, urgency: "now", photo: null,
        carNumber: String(driver.carNumber), status: "open",
        reportedBy: { uid, name: driver.name || "", inspectionId: null, type: "call" },
        shopNotes: "", createdAt: nowMs, updatedAt: nowMs, history: [{ status: "open", at: nowMs, by: driver.name || "driver" }],
      });
      tx.set(db().collection("vehicles").doc(String(driver.carNumber)), { openRepairs: FieldValue.increment(1), unsafeReportedAt: nowMs }, { merge: true });
    }
    return { outcome, ride, warnings: driverPatch.warnings ?? null, suspended, offline, noShowFeeCents };
  });

  // No-show fee from the card hold (the rest is released), or release the hold.
  let fee = null;
  if (out.noShowFeeCents > 0) {
    fee = await require("./rideFees").chargeRideFee({
      stripe: require("stripe")(STRIPE_SECRET_KEY.value()),
      ride: out.ride,
      rideId,
      cents: out.noShowFeeCents,
      kind: "no_show_fee",
    });
    if (fee.chargedCents > 0) {
      await db().collection("driverInbox").doc(uid).set(
        { notice: { text: `No-show recorded. $${(fee.chargedCents / 100).toFixed(2)} goes to your lease credit.`, at: Date.now() } },
        { merge: true }
      );
    }
  } else if (out.outcome === "cancel" && out.ride.paymentMethod === "card" && out.ride.paymentIntentId) {
    try {
      await require("stripe")(STRIPE_SECRET_KEY.value()).paymentIntents.cancel(out.ride.paymentIntentId);
    } catch {
      // Already released.
    }
  }
  if (out.outcome === "redispatch") await E.startDispatch(rideId);
  return { outcome: out.outcome, warnings: out.warnings, suspended: out.suspended, offline: out.offline, fee };
});

exports.ackAlert = onCall(async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Dispatchers only.");
  const id = String(request.data?.id || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpsError("invalid-argument", "Missing alert.");
  await db().collection("alerts").doc(id).update({ status: "handled", handledAt: Date.now(), handledBy: request.auth.uid });
  return { ok: true };
});
