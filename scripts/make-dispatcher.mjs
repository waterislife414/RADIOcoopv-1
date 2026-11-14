// One-time, per project: gives an existing sign-in the dispatcher/owner role.
//   node scripts/make-dispatcher.mjs owner@example.com
// Run in Cloud Shell (it uses your Google sign-in). The person must already
// have an account (create it on the app's Sign Up page or in the Firebase console).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const branding = JSON.parse(readFileSync(new URL("../branding.config.json", import.meta.url)));
const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/make-dispatcher.mjs <email>");
  process.exit(1);
}
admin.initializeApp({ projectId: branding.infrastructure.firebase.projectId });
const user = await admin.auth().getUserByEmail(email);
await admin.auth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
console.log(`${email} is now a dispatcher/owner. Have them sign out and back in.`);
