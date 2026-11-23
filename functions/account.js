// Account deletion. Google Play requires an in-app way to delete an account
// and a web page for it; both use deleteMyAccount (page: /delete-account).
//
// Deleted: the rider's profile (users/{uid}), their ID and face photos, and
// their sign-in. Kept, as the Privacy Policy says: ride and payment records
// (business, tax and safety records), blocked phone numbers (blacklist_phones,
// not part of the account) and, only if fees are owed, a small note so the
// debt isn't wiped out by deleting.
// Drivers and office staff are closed by the office (lick credit, records).
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = () => admin.firestore();
const ACTIVE_PLAN = ["active", "trialing", "past_due", "incomplete"];
const OPEN_RIDE = ["pending", "dispatched", "in_transit"];

exports.deleteMyAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to delete your account.");
  const claims = request.auth.token || {};
  if (claims.driver === true || claims.admin === true || claims.mechanic === true) {
    throw new HttpsError("failed-precondition", "Driver and office accounts are closed by the office. Please call us.");
  }
  if (request.data?.confirm !== "DELETE") {
    throw new HttpsError("invalid-argument", "Confirm by sending DELETE.");
  }

  const userRef = db().collection("users").doc(uid);
  const user = (await userRef.get()).data() || {};
  if (ACTIVE_PLAN.includes(user.subscriptionStatus)) {
    throw new HttpsError("failed-precondition", "Cancel your membership first (My Account, Membership), then delete your account.");
  }
  const open = await db()
    .collection("rides")
    .where("customerId", "==", uid)
    .where("status", "in", OPEN_RIDE)
    .limit(1)
    .get();
  if (!open.empty) throw new HttpsError("failed-precondition", "Finish or cancel your ride first, then delete your account.");

  // Keep only what an unpaid fee needs.
  const owed = Number(user.feesOwedCents) || 0;
  if (owed > 0) {
    await db().collection("deleted_accounts").doc(uid).set({
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      feesOwedCents: owed,
      phone: user.phone || null,
    });
  }

  // Photos: best effort; anything left is listed for the office to remove.
  let photosLeft = false;
  try {
    await admin.storage().bucket().deleteFiles({ prefix: `id_verification/${uid}/` });
  } catch {
    photosLeft = true;
  }
  if (photosLeft) {
    await db().collection("owner_inbox").add({
      type: "account_deleted_photos",
      uid,
      note: `Remove ID/face photos in Storage under id_verification/${uid}/`,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await userRef.delete();
  await admin.auth().deleteUser(uid);
  return { ok: true };
});
