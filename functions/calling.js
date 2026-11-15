// Twilio settings for private rider/driver calls. The account SID and phone
// number are plain settings (functions/.env); the auth token is a secret.
const { defineSecret, defineString } = require("firebase-functions/params");

const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_ACCOUNT_SID = defineString("TWILIO_ACCOUNT_SID", { default: "" });
const TWILIO_PHONE_NUMBER = defineString("TWILIO_PHONE_NUMBER", { default: "" });

const val = (p) => String(p.value() || "");
const isDemo = (v) => v.startsWith("demo-");

/**
 * Calling is set up when the SID and number are filled in (any function can
 * tell; only the calling function can read the token). When it is, drivers
 * don't get riders' real numbers: they call through the company line.
 */
function callingConfigured() {
  const sid = val(TWILIO_ACCOUNT_SID);
  const num = val(TWILIO_PHONE_NUMBER);
  return !!sid && !!num && !isDemo(sid) && sid.toLowerCase() !== "none";
}

/** "live", "demo" or "off" (needs the token, so only inside startMaskedCall). */
function callMode() {
  const vals = [val(TWILIO_ACCOUNT_SID), val(TWILIO_AUTH_TOKEN), val(TWILIO_PHONE_NUMBER)];
  if (vals.some(isDemo)) return "demo";
  if (vals.some((v) => !v || v.toLowerCase() === "none")) return "off";
  return "live";
}

module.exports = { TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_PHONE_NUMBER, callingConfigured, callMode };
