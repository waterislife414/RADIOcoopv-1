// While a ride is on: the rider's live location for the driver, "I'm at the
// car" replies, place in line (with the Day Pass offer), the Day Pass added
// to a waiting ride, and private calls between rider and driver.
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const BRANDING = require("./branding.json");
const E = require("./dispatchEngine");

const FieldValue = admin.firestore.FieldValue;
const db = () => admin.firestore();
const rideRef = (id) => db().collection("rides").doc(id);
const inboxRef = (uid) => db().collection("driverInbox").doc(uid);
const CALLING = BRANDING.calling || {};
const PERKS = BRANDING.ridePerks || {};

// Twilio settings (functions/calling.js). Blank (or "none") = calls aren't set
// up yet; riders get the office number and drivers dial direct.
const { TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_PHONE_NUMBER, callMode } = require("./calling");

let timingPromise;
const timing = () => (timingPromise ||= import("./lib/rideTiming.mjs"));

function rideIdFrom(data) {
  const id = String(data?.rideId || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpsError("invalid-argument", "Missing ride.");
  return id;
}
function fixFrom(data) {
  const lat = Number(data?.lat);
  const lng = Number(data?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpsError("invalid-argument", "No location.");
  }
  const acc = Number(data?.acc);
  return { lat, lng, acc: Number.isFinite(acc) ? Math.round(acc) : null };
}
const e164 = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
};
const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);

/** Rider's phone, while the ride is on: lets the driver find them. */
exports.riderPing = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const rideId = rideIdFrom(request.data);
  const fix = fixFrom(request.data);
  const nowMs = Date.now();
  return db().runTransaction(async (tx) => {
    const ride = (await tx.get(rideRef(rideId))).data();
    if (!ride || ride.customerId !== uid) throw new HttpsError("not-found", "Ride not found.");
    if (!["pending", "dispatched", "in_transit"].includes(ride.status) || ride.shareLocation === false) return { ok: false };
    if (ride.riderPos?.at > nowMs - 8000) return { ok: true, skipped: true };
    const riderPos = { ...fix, at: nowMs };
    tx.update(rideRef(rideId), { riderPos });
    if (ride.driverId && ride.status === "dispatched") tx.set(inboxRef(ride.driverId), { current: { riderPos } }, { merge: true });
    return { ok: true };
  });
});

/** "I'm at the car" / "Need a minute", after the driver arrives. */
exports.riderArrivalReply = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const rideId = rideIdFrom(request.data);
  const reply = ["here", "minute"].includes(request.data?.reply) ? request.data.reply : null;
  if (!reply) throw new HttpsError("invalid-argument", "Pick an answer.");
  const nowMs = Date.now();
  return db().runTransaction(async (tx) => {
    const ride = (await tx.get(rideRef(rideId))).data();
    if (!ride || ride.customerId !== uid) throw new HttpsError("not-found", "Ride not found.");
    if (ride.status !== "dispatched") return { ok: false };
    const riderReply = { reply, at: nowMs };
    tx.update(rideRef(rideId), { riderReply });
    if (ride.driverId) tx.set(inboxRef(ride.driverId), { current: { riderReply } }, { merge: true });
    return { ok: true };
  });
});

/**
 * Place in line while waiting for a driver. Guests can ask with their ride id
 * (it's unguessable); only the number comes back.
 */
exports.queueStatus = onCall(async (request) => {
  const T = await timing();
  const rideId = rideIdFrom(request.data);
  const snap = await rideRef(rideId).get();
  const ride = snap.data();
  const uid = request.auth?.uid || null;
  if (!ride || (ride.customerId !== "guest" && ride.customerId !== uid)) throw new HttpsError("not-found", "Ride not found.");
  const hasPriority = ride.priority === "premium" || ride.priority === "vip";
  if (ride.status !== "pending" || ride.driverId || ride.dispatchState === "scheduled") {
    return { waiting: false, status: ride.status, hasPriority };
  }
  let q = db().collection("rides").where("status", "==", "pending");
  if (ride.zoneId) q = q.where("zoneId", "==", ride.zoneId);
  const others = await q.limit(200).get();
  const ms = (r) => (r.timestamp?.toMillis ? r.timestamp.toMillis() : Number(r.createdMs) || 0);
  const waiting = others.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    // Same line only: app rides wait for app drivers, radio rides for the dispatcher.
    .filter((r) => !r.driverId && r.dispatchState !== "scheduled" && (r.appHandled !== false) === (ride.appHandled !== false))
    .map((r) => ({ id: r.id, priority: r.priority || null, createdMs: ms(r) }));
  const position = T.queuePosition({ id: rideId, priority: ride.priority || null, createdMs: ms(ride) }, waiting);
  // Map and calling only work on app rides (signed in, card, location on);
  // a radio ride's Day Pass just moves it up the dispatcher's list.
  return { waiting: true, position, hasPriority, premium: ride.priority === "premium", appRide: ride.appHandled !== false && !!uid };
});

/** Put a paid Priority Day Pass on a ride that's already waiting: it moves up the line. */
exports.applyDayPass = onCall(async (request) => {
  const T = await timing();
  const rideId = rideIdFrom(request.data);
  const passId = String(request.data?.passId || "");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(passId)) throw new HttpsError("invalid-argument", "Missing pass.");
  const uid = request.auth?.uid || "guest";
  const nowMs = Date.now();
  await db().runTransaction(async (tx) => {
    const [rs, ps] = await Promise.all([tx.get(rideRef(rideId)), tx.get(db().collection("fast_passes").doc(passId))]);
    const ride = rs.data();
    const pass = ps.data();
    if (!ride || (ride.customerId !== "guest" && ride.customerId !== uid)) throw new HttpsError("not-found", "Ride not found.");
    if (!T.isDayPassValid(pass, ride.customerId, rideId, nowMs)) throw new HttpsError("failed-precondition", "That pass isn't valid for this ride.");
    if (!["pending", "dispatched"].includes(ride.status)) throw new HttpsError("failed-precondition", "This ride is already under way.");
    // Waiting: it moves up the line. Driver already coming: the map and calling switch on.
    const waiting = ride.status === "pending" && !ride.driverId;
    const perks = T.perksFor({ dayPass: true }, PERKS);
    tx.update(rideRef(rideId), {
      wantsPriorityPass: true,
      fastPassId: passId,
      ...(waiting ? { priority: ride.priority === "premium" ? "premium" : "vip" } : {}),
      perks: { liveMap: !!(ride.perks?.liveMap || perks.liveMap), callDriver: !!(ride.perks?.callDriver || perks.callDriver) },
    });
    if (pass.uid === "guest") tx.update(ps.ref, { rideId });
    else tx.update(ps.ref, { rides: FieldValue.arrayUnion(rideId) });
  });
  await E.startDispatch(rideId); // no-op unless it's still waiting
  return { ok: true };
});

// The person who answers hears the recording notice too, before they're
// connected (Twilio plays this page's message to them).
exports.callNotice = onRequest((req, res) => {
  const say = CALLING.answerNotice || `This call is from ${BRANDING.companyName || "your taxi company"} and may be recorded for quality and safety.`;
  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xml(say)}</Say></Response>`);
});
function noticeUrl() {
  if (CALLING.noticeUrl) return CALLING.noticeUrl;
  return `https://us-central1-${process.env.GCLOUD_PROJECT || ""}.cloudfunctions.net/callNotice`;
}

/**
 * Private call: Twilio rings the caller's phone from the company number,
 * plays the recording notice, then connects the other person. Nobody sees a
 * real number. Drivers can always call their rider; riders need the Day Pass
 * or a membership that includes it.
 */
exports.startMaskedCall = onCall({ secrets: [TWILIO_AUTH_TOKEN] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const rideId = rideIdFrom(request.data);
  const snap = await rideRef(rideId).get();
  const ride = snap.data();
  if (!ride) throw new HttpsError("not-found", "Ride not found.");
  const isDriver = ride.driverId === uid;
  const isRider = ride.customerId === uid;
  if (!isDriver && !isRider) throw new HttpsError("permission-denied", "That isn't your ride.");
  if (!["dispatched", "in_transit"].includes(ride.status)) throw new HttpsError("failed-precondition", "Calls work while the ride is on.");
  if (isRider && !ride.perks?.callDriver) {
    throw new HttpsError("failed-precondition", "Calling your driver comes with the Priority Day Pass and Premium.");
  }
  const who = isDriver ? "driver" : "rider";
  const max = CALLING.callsPerRidePerPerson || 6;

  const [userSnap, driverSnap] = await Promise.all([
    ride.customerId && ride.customerId !== "guest" ? db().collection("users").doc(ride.customerId).get() : null,
    ride.driverId ? db().collection("drivers").doc(ride.driverId).get() : null,
  ]);
  // The account's phone (not the editable number on the booking) is the one the company line rings.
  const riderPhone = e164(userSnap?.data()?.phone || ride.phone);
  const driverPhone = e164(driverSnap?.data()?.phone);
  const from = isDriver ? driverPhone : riderPhone;
  const to = isDriver ? riderPhone : driverPhone;
  const otherLabel = isDriver ? "your rider" : `Car ${ride.carNumber || ""}`.trim();
  const mode = callMode();
  // Calls not set up yet: a driver can still dial his rider directly (he
  // could before private calling existed); a rider gets the office number.
  if (mode !== "live") {
    return { mode, otherLabel, officePhone: BRANDING.companyPhoneDisplay || null, ...(isDriver && riderPhone ? { directTel: riderPhone } : {}) };
  }
  if (!from || !to) throw new HttpsError("failed-precondition", "We don't have a phone number for this ride. Please call the office.");
  // Count the call and check the limit in one step, so parallel taps can't go over.
  await db().runTransaction(async (tx) => {
    const used = (await tx.get(rideRef(rideId))).data()?.calls?.[who] || 0;
    if (used >= max) throw new HttpsError("resource-exhausted", "That's the most calls for one ride. Please call the office.");
    tx.update(rideRef(rideId), { [`calls.${who}`]: FieldValue.increment(1) });
  });
  const logRef = db().collection("ride_calls").doc();
  await logRef.set({ rideId, by: who, uid, at: Date.now(), mode, status: "started" });

  const sid = TWILIO_ACCOUNT_SID.value();
  const token = TWILIO_AUTH_TOKEN.value();
  const number = TWILIO_PHONE_NUMBER.value();
  const record = CALLING.recordCalls === false ? "" : ' record="record-from-answer-dual"';
  const limit = Math.max(1, CALLING.maxCallMinutes || 10) * 60;
  const twiml =
    `<Response><Say>${xml(CALLING.greeting || "Connecting you now. This call may be recorded for quality and safety.")}</Say>` +
    `<Dial callerId="${xml(number)}" timeLimit="${limit}" answerOnBridge="true"${record}><Number url="${xml(noticeUrl())}">${xml(to)}</Number></Dial></Response>`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: from, From: number, Twiml: twiml, Timeout: "25" }),
  });
  const body = await res.json().catch(() => ({}));
  await logRef.update({ status: res.ok ? "ringing" : "failed", twilioSid: body.sid || null, error: res.ok ? null : body.message || res.status });
  if (!res.ok) throw new HttpsError("unavailable", "The call didn't go through. Try again or call the office.");
  return { mode, otherLabel, callerId: number };
});
