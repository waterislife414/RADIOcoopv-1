// Vehicle inspections and shop work orders.
// Drivers file inspections (first 360, weekly, start-of-shift, damage, problems).
// Problems become work orders on the shop board for the mechanics.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { requireDriver } = require("./workRules");

const db = () => admin.firestore();
const FieldValue = admin.firestore.FieldValue;
let corePromise = null;
const core = () => (corePromise ||= import("./lib/inspectionCore.mjs"));

const STATUSES = ["open", "parts_ordered", "scheduled", "done"];
const isOpen = (s) => s !== "done";

const isAdmin = (request) => request.auth?.token?.admin === true;
const isShop = (request) => isAdmin(request) || request.auth?.token?.shop === true;
function requireShop(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!isShop(request)) throw new HttpsError("permission-denied", "Office or shop only.");
  return request.auth.uid;
}

/** Driver files an inspection. Photos are uploaded first; only their storage paths come here. */
exports.submitInspection = onCall(async (request) => {
  const uid = requireDriver(request);
  const c = await core();
  const type = String(request.data?.type || "");
  const res = c.validateInspection(type, request.data || {});
  if (res.error) throw new HttpsError("invalid-argument", res.error);
  const v = res.value;
  const own = (p) => !p || p.startsWith(`inspections/${uid}/`);
  if (![...Object.values(v.photos), v.video, ...v.damages.map((d) => d.photo), ...v.repairs.map((r) => r.photo)].every(own)) {
    throw new HttpsError("invalid-argument", "Photos must be your own uploads.");
  }

  const driverSnap = await db().collection("drivers").doc(uid).get();
  const driver = driverSnap.data() || {};
  const carNumber = driver.carNumber ? String(driver.carNumber) : null;
  if (!carNumber) throw new HttpsError("failed-precondition", "You don't have a car assigned yet. See the office.");

  const nowMs = Date.now();
  const inspRef = db().collection("vehicle_inspections").doc();
  const orders = c.workOrdersFrom(v);
  const batch = db().batch();
  batch.set(inspRef, {
    ...v,
    carNumber,
    driverId: uid,
    driverName: driver.name || "",
    at: nowMs,
    createdAt: FieldValue.serverTimestamp(),
    workOrderCount: orders.length,
  });
  for (const o of orders) {
    batch.set(db().collection("work_orders").doc(), {
      ...o,
      carNumber,
      status: "open",
      reportedBy: { uid, name: driver.name || "", inspectionId: inspRef.id, type },
      shopNotes: "",
      createdAt: nowMs,
      updatedAt: nowMs,
      history: [{ status: "open", at: nowMs, by: driver.name || "driver" }],
    });
  }

  const insp = { ...(driver.inspection || {}) };
  if (insp.carNumber !== carNumber) {
    insp.carNumber = carNumber;
    insp.initialAt = null;
    insp.lastFullAt = null;
  }
  if (type === "initial") insp.initialAt = nowMs;
  if (type === "initial" || type === "weekly") {
    insp.lastFullAt = nowMs;
    insp.shiftCheckAt = nowMs; // a full inspection covers this shift too
  }
  if (type === "shift") insp.shiftCheckAt = nowMs;
  insp.lastAt = nowMs;
  insp.lastType = type;
  batch.set(db().collection("drivers").doc(uid), { inspection: insp }, { merge: true });

  const vehicle = { lastInspectionAt: nowMs, lastInspectionType: type, lastDriverId: uid };
  if (v.mileage) vehicle.mileage = v.mileage;
  if (orders.length) vehicle.openRepairs = FieldValue.increment(orders.length);
  if (orders.some((o) => o.urgency === "now")) vehicle.unsafeReportedAt = nowMs;
  batch.set(db().collection("vehicles").doc(carNumber), vehicle, { merge: true });

  await batch.commit();
  return { id: inspRef.id, workOrders: orders.length };
});

/** Shop or office adds a repair by hand. */
exports.createWorkOrder = onCall(async (request) => {
  requireShop(request);
  const c = await core();
  const carNumber = String(request.data?.carNumber || "").trim();
  if (!/^[A-Za-z0-9-]{1,10}$/.test(carNumber)) throw new HttpsError("invalid-argument", "Car number?");
  const item = c.REPAIR_ITEMS.includes(request.data?.item) ? request.data.item : "Other";
  const description = String(request.data?.description || "").trim().slice(0, 500);
  if (!description) throw new HttpsError("invalid-argument", "Describe the repair.");
  const urgency = c.URGENCY[request.data?.urgency] ? request.data.urgency : "soon";
  const nowMs = Date.now();
  const who = request.auth.token.name || request.auth.token.email || "office";
  const ref = db().collection("work_orders").doc();
  await db().runTransaction(async (tx) => {
    tx.set(ref, {
      item, description, urgency, photo: null, carNumber, status: "open",
      reportedBy: { uid: request.auth.uid, name: who, inspectionId: null, type: "shop" },
      shopNotes: "", createdAt: nowMs, updatedAt: nowMs,
      history: [{ status: "open", at: nowMs, by: who }],
    });
    tx.set(db().collection("vehicles").doc(carNumber), { openRepairs: FieldValue.increment(1) }, { merge: true });
  });
  return { id: ref.id };
});

/** Move a work order along: open -> parts ordered -> scheduled -> done. */
exports.updateWorkOrder = onCall(async (request) => {
  requireShop(request);
  const id = String(request.data?.id || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpsError("invalid-argument", "Missing work order.");
  const status = request.data?.status;
  if (status != null && !STATUSES.includes(status)) throw new HttpsError("invalid-argument", "Unknown status.");
  const notes = request.data?.shopNotes;
  const who = request.auth.token.name || request.auth.token.email || "shop";
  const nowMs = Date.now();
  await db().runTransaction(async (tx) => {
    const ref = db().collection("work_orders").doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Work order not found.");
    const wo = snap.data();
    const update = { updatedAt: nowMs };
    if (typeof notes === "string") update.shopNotes = notes.trim().slice(0, 1000);
    if (status && status !== wo.status) {
      update.status = status;
      update.history = [...(wo.history || []), { status, at: nowMs, by: who }].slice(-30);
      if (status === "done") update.doneAt = nowMs;
      const delta = (isOpen(status) ? 1 : 0) - (isOpen(wo.status) ? 1 : 0);
      if (delta) tx.set(db().collection("vehicles").doc(String(wo.carNumber)), { openRepairs: FieldValue.increment(delta) }, { merge: true });
    }
    tx.update(ref, update);
  });
  return { ok: true };
});

/** Office gives (or takes away) a mechanic's access to the shop board. */
exports.setShopAccess = onCall(async (request) => {
  if (!isAdmin(request)) throw new HttpsError("permission-denied", "Office only.");
  const email = String(request.data?.email || "").trim().toLowerCase();
  if (!email.includes("@")) throw new HttpsError("invalid-argument", "Enter the mechanic's email.");
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch {
    throw new HttpsError("not-found", "No account with that email. Have them sign up first.");
  }
  const claims = { ...(user.customClaims || {}) };
  if (request.data?.allow === false) delete claims.shop;
  else claims.shop = true;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  return { uid: user.uid, shop: !!claims.shop };
});
