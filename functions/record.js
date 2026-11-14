// Driver profile and record: contact details the driver keeps current,
// incidents the office adds (accident, complaint, no-show, write-up), and
// the choice to hold lease credit for a day.
//   drivers/{uid}/record/{id}  { type, at, expiresAt, points, note, source, by }
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { requireDriver, LEASE_CFG, INCENTIVES } = require("./workRules");

const db = () => admin.firestore();
let corePromise = null;
const core = () => (corePromise ||= import("./lib/dispatchCore.mjs"));
const driverRef = (uid) => db().collection("drivers").doc(uid);
const clean = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const digits = (v) => String(v ?? "").replace(/\D/g, "").slice(0, 10);

function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Dispatcher access required.");
  }
  return request.auth.uid;
}

exports.updateDriverContact = onCall(async (request) => {
  const uid = requireDriver(request);
  const d = request.data || {};
  const phone = digits(d.phone);
  if (phone.length !== 10) throw new HttpsError("invalid-argument", "Enter a 10-digit phone number.");
  const emergencyPhone = digits(d.emergencyPhone);
  if (d.emergencyPhone && emergencyPhone.length !== 10) throw new HttpsError("invalid-argument", "Emergency contact phone must be 10 digits.");
  await driverRef(uid).update({
    phone,
    address: clean(d.address, 160),
    emergencyName: clean(d.emergencyName, 80),
    emergencyPhone,
    contactUpdatedAt: Date.now(),
  });
  return { ok: true };
});

// Office adds something to a driver's record. It shows on his profile for
// scoreWindowDays and takes points off his score.
exports.addDriverIncident = onCall(async (request) => {
  const by = requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const type = String(request.data?.type || "");
  const note = clean(request.data?.note, 300);
  if (!Object.keys(INCENTIVES.penaltyPoints).includes(type)) throw new HttpsError("invalid-argument", "Pick what happened.");
  if (!note) throw new HttpsError("invalid-argument", "Add a short note about what happened.");
  const asked = Number(request.data?.points);
  const points = Number.isFinite(asked) ? Math.min(100, Math.max(0, Math.round(asked))) : INCENTIVES.penaltyPoints[type];
  const c = await core();
  const nowMs = Date.now();
  return db().runTransaction(async (tx) => {
    const ds = await tx.get(driverRef(uid));
    if (!ds.exists) throw new HttpsError("not-found", "Driver not found.");
    const driver = ds.data();
    const after = c.standing({ ...driver, penalties: [...(driver.penalties || []), { at: nowMs, points, type }] }, nowMs, INCENTIVES);
    const hold = c.callHoldUntil(after.score, nowMs, INCENTIVES);
    tx.update(driverRef(uid), { ...after, ...(hold ? { callHoldUntil: hold } : {}) });
    tx.set(driverRef(uid).collection("record").doc(), {
      type, note, points, at: nowMs, expiresAt: nowMs + INCENTIVES.scoreWindowDays * 86400000, source: "office", by,
    });
    return { ok: true, score: after.score, callHoldUntil: hold };
  });
});

// Driver: hold banked lease credit for the current lease day (or go back to using it).
exports.setLeaseHold = onCall(async (request) => {
  const uid = requireDriver(request);
  const hold = request.data?.hold === true;
  const c = await core();
  const nowMs = Date.now();
  const key = c.leasePeriodKey(nowMs, LEASE_CFG);
  return db().runTransaction(async (tx) => {
    const ds = await tx.get(driverRef(uid));
    const driver = ds.data();
    if (!driver) throw new HttpsError("not-found", "Driver not found.");
    if (hold) {
      const ok = c.canHoldCredit(driver, nowMs, INCENTIVES);
      if (!ok.ok) {
        throw new HttpsError(
          "failed-precondition",
          ok.reason === "too_new"
            ? `Holding credit opens up after ${INCENTIVES.holdCreditAfterDays} days of driving.`
            : `Holding credit needs a clean record for ${INCENTIVES.scoreWindowDays} days.`
        );
      }
    }
    tx.update(driverRef(uid), { holdCreditPeriod: hold ? key : null });
    return { ok: true, holdCreditPeriod: hold ? key : null };
  });
});
