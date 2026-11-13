const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

exports.setAdminClaim = onCall(async (request) => {
  const { targetUid, secret } = request.data;
  if (secret !== process.env.ADMIN_SETUP_SECRET) {
    throw new HttpsError("permission-denied", "Invalid secret.");
  }
  await admin.auth().setCustomUserClaims(targetUid, { admin: true });
  return { success: true };
});
