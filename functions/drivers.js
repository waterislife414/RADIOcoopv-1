// Driver accounts: approval, rejection, and the public "board" record.
// Every write that decides who a driver is (claims, car #, certs) happens
// here on the server — the client can only ask.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();

function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Dispatcher access required.");
  }
}

function cleanCarNumber(value) {
  const car = String(value || "").trim();
  if (!/^[A-Za-z0-9-]{1,6}$/.test(car)) {
    throw new HttpsError("invalid-argument", "Car number must be 1-6 letters/numbers.");
  }
  return car;
}

// Admin approves a pending application: gives the account the driver role,
// assigns the car number, and creates the driver + board records.
exports.approveDriver = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const carNumber = cleanCarNumber(request.data?.carNumber);
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");

  const appRef = db().collection("driver_applications").doc(uid);
  const appSnap = await appRef.get();
  if (!appSnap.exists) throw new HttpsError("not-found", "Application not found.");
  const app = appSnap.data();

  const user = await admin.auth().getUser(uid);
  await admin.auth().setCustomUserClaims(uid, { ...(user.customClaims || {}), driver: true });

  const driverRef = db().collection("drivers").doc(uid);
  const existing = await driverRef.get();
  const profile = {
    uid,
    name: app.fullName || user.displayName || "",
    email: app.email || user.email || "",
    phone: app.phone || "",
    carNumber,
    active: true,
    approvedAt: now(),
    approvedBy: request.auth.uid,
  };

  const batch = db().batch();
  if (existing.exists) {
    batch.set(driverRef, profile, { merge: true });
  } else {
    batch.set(driverRef, {
      ...profile,
      status: "offline",
      certs: {},
      warnings: 0,
      score: 100,
      leaseCreditCents: 0,
      createdAt: now(),
    });
  }
  batch.set(
    db().collection("board").doc(uid),
    { carNumber, status: "offline", zoneId: null, lineKey: null, updatedAt: now() },
    { merge: true }
  );
  batch.update(appRef, {
    status: "approved",
    carNumber,
    reviewedAt: now(),
    reviewedBy: request.auth.uid,
  });
  await batch.commit();
  return { success: true };
});

exports.rejectDriver = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");
  await db()
    .collection("driver_applications")
    .doc(uid)
    .update({
      status: "rejected",
      rejectReason: String(request.data?.reason || "").slice(0, 300),
      reviewedAt: now(),
      reviewedBy: request.auth.uid,
    });
  return { success: true };
});

// Admin changes a driver's car number (e.g. moved to a different car).
exports.setDriverCar = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const carNumber = cleanCarNumber(request.data?.carNumber);
  const batch = db().batch();
  batch.update(db().collection("drivers").doc(uid), { carNumber });
  batch.set(db().collection("board").doc(uid), { carNumber, updatedAt: now() }, { merge: true });
  await batch.commit();
  return { success: true };
});
