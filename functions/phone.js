// Dispatcher Quick Entry: a rider phones in, the dispatcher types the
// number, picks a saved address, and posts the ride. In auto mode it goes
// straight to a driver. Repeat callers can be remembered (name + places) in
// phoneRiders/{phone}; the dispatcher can forget a caller any time.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getZones } = require("./zoneStore");

const FieldValue = admin.firestore.FieldValue;
const db = () => admin.firestore();
const MAX_PLACES = 8;

function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Dispatcher access required.");
  }
  return request.auth.uid;
}

const clean = (v, max = 200) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
// 10-digit US number: a leading 1 (country code) and extensions are dropped, so
// "+1 (706) 555-0100" and "706-555-0100 ext 9" match the same caller and block list.
const digits = (v) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length >= 11 && d.startsWith("1")) d = d.slice(1);
  return d.length > 10 ? d.slice(0, 10) : d;
};

/** Most-used places first; bump this one. */
function mergePlaces(places = [], texts, nowMs) {
  const list = [...places];
  for (const text of texts.filter(Boolean)) {
    const i = list.findIndex((p) => p.text.toLowerCase() === text.toLowerCase());
    if (i >= 0) list[i] = { ...list[i], count: (list[i].count || 0) + 1, lastAt: nowMs };
    else list.push({ text, count: 1, lastAt: nowMs });
  }
  return list.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, MAX_PLACES);
}

exports.dispatcherCreateRide = onCall(async (request) => {
  const by = requireAdmin(request);
  const d = request.data || {};
  const phone = digits(d.phone);
  const pickup = clean(d.pickup);
  const dropoff = clean(d.dropoff);
  const firstName = clean(d.firstName, 40) || null;
  const lastName = clean(d.lastName, 40) || null;
  const passengers = Math.min(8, Math.max(1, parseInt(d.passengers, 10) || 1));
  const later = d.scheduleType === "later";
  const scheduledFor = later ? clean(d.scheduledFor, 16) : null;
  if (phone.length !== 10) throw new HttpsError("invalid-argument", "Enter the caller's 10-digit phone number.");
  if (!pickup) throw new HttpsError("invalid-argument", "Enter the pickup.");
  // Every customer agrees to the terms: on a phone call the dispatcher reads
  // the short ride rules and ticks the box once the caller says OK.
  if (d.termsRead !== true) throw new HttpsError("invalid-argument", "Read the ride rules to the caller, then tick the box.");
  if (later && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledFor)) throw new HttpsError("invalid-argument", "Pick the pickup time.");

  const zones = await getZones();
  const zone = d.zoneId ? zones.find((z) => z.id === d.zoneId) : null;
  if (d.zoneId && !zone) throw new HttpsError("invalid-argument", "Unknown zone.");
  if ((await db().collection("blacklist_phones").doc(phone).get()).exists) {
    throw new HttpsError("failed-precondition", "This number is blocked from booking.");
  }
  let requestedDriverId = null;
  if (d.requestedDriverId) {
    const b = await db().collection("board").doc(String(d.requestedDriverId)).get();
    if (!b.exists) throw new HttpsError("invalid-argument", "That car isn't on the roster.");
    requestedDriverId = b.id;
  }

  const nowMs = Date.now();
  const rideRef = db().collection("rides").doc();
  const saved = db().collection("phoneRiders").doc(phone);
  await db().runTransaction(async (tx) => {
    const s = await tx.get(saved);
    const prev = s.data() || {};
    tx.set(rideRef, {
      customerId: prev.customerId || "guest",
      firstName,
      lastName,
      phone,
      pickup,
      dropoff,
      passengers,
      stops: [],
      needsAccessibleVehicle: !!d.wheelchair,
      wantsPriorityPass: false,
      roundTrip: false,
      estMiles: null,
      outOfArea: false,
      scheduleType: later ? "later" : "now",
      scheduledFor,
      recurring: null,
      paymentMethod: "cash",
      paymentIntentId: null,
      promoCode: null,
      status: "pending",
      finalFare: null,
      timestamp: FieldValue.serverTimestamp(),
      source: "phone",
      termsRead: true,
      termsVersion: require("./branding.json").legalVersion,
      enteredBy: by,
      notes: clean(d.notes, 300) || null,
      ...(zone ? { zoneId: zone.id, zoneLabel: zone.label } : {}),
      ...(requestedDriverId ? { requestedDriverId } : {}),
    });
    if (d.remember !== false) {
      tx.set(
        saved,
        {
          phone,
          firstName: firstName ?? prev.firstName ?? null,
          lastName: lastName ?? prev.lastName ?? null,
          places: mergePlaces(prev.places, [pickup, dropoff], nowMs),
          rideCount: (prev.rideCount || 0) + 1,
          lastRideAt: nowMs,
          updatedBy: by,
        },
        { merge: true }
      );
    }
  });
  return { ok: true, rideId: rideRef.id };
});

exports.forgetCaller = onCall(async (request) => {
  requireAdmin(request);
  const phone = digits(request.data?.phone);
  if (phone.length !== 10) throw new HttpsError("invalid-argument", "Bad number.");
  await db().collection("phoneRiders").doc(phone).delete();
  return { ok: true };
});

// Callers who haven't ridden in a year are forgotten.
exports.purgeOldCallers = onSchedule({ schedule: "every day 03:15", timeZone: "America/New_York" }, async () => {
  const cutoff = Date.now() - 365 * 86400000;
  const snap = await db().collection("phoneRiders").where("lastRideAt", "<", cutoff).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  if (snap.size) console.log(`Forgot ${snap.size} inactive caller(s).`);
  return null;
});

module.exports._internal = { mergePlaces };
