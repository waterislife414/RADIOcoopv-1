#!/usr/bin/env node
// Plugs a filled-in docs/KEYS-FILL-IN.txt into the app. Only settings and
// keys change, never the program.
//
//   node scripts/apply-keys.mjs path/to/filled-sheet.txt
//
// Writes branding.config.json and functions/.env, then prints the Cloud
// Shell commands for the secrets (which are never put in a file) and deploy.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Usage: node scripts/apply-keys.mjs <filled-sheet.txt>");
  process.exit(1);
}

const vals = {};
for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z][A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(raw);
  if (m && m[2]) vals[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const problems = [];
const warn = (msg) => problems.push(msg);

// Secrets must never travel in the sheet.
for (const [k, v] of Object.entries(vals)) {
  if (/^(sk|rk)_(live|test)_/.test(v) || /^whsec_/.test(v) || /AUTH_TOKEN|SECRET|PASSWORD/.test(k)) {
    warn(`${k}: that's a secret. It was NOT used. Type it in Cloud Shell with the command below, and change it if it was sent anywhere.`);
    delete vals[k];
  }
}

const check = (k, re, hint) => {
  if (vals[k] && !re.test(vals[k])) {
    warn(`${k} doesn't look right (${hint}). Skipped.`);
    delete vals[k];
  }
};
check("FIREBASE_PROJECT_ID", /^[a-z][a-z0-9-]{4,29}$/, "lowercase letters, numbers, dashes");
check("FIREBASE_API_KEY", /^AIza[0-9A-Za-z_-]{30,}$/, "starts AIza");
check("STRIPE_PUBLISHABLE_KEY", /^pk_(live|test)_[0-9A-Za-z]+$/, "starts pk_live_");
check("TWILIO_ACCOUNT_SID", /^AC[0-9a-f]{32}$/i, "AC + 32 letters/numbers");
check("OWNER_LOGIN_EMAIL", /^[^@\s]+@[^@\s]+\.[^@\s]+$/, "an email address");
check("SHOP_LOGIN_EMAIL", /^[^@\s]+@[^@\s]+\.[^@\s]+$/, "an email address");
if (vals.TWILIO_PHONE_NUMBER) {
  const d = vals.TWILIO_PHONE_NUMBER.replace(/\D/g, "");
  const e164 = d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith("1") ? `+${d}` : null;
  if (e164) vals.TWILIO_PHONE_NUMBER = e164;
  else {
    warn("TWILIO_PHONE_NUMBER should be a 10-digit US number. Skipped.");
    delete vals.TWILIO_PHONE_NUMBER;
  }
}
if (vals.FIREBASE_PROJECT_ID) {
  vals.FIREBASE_AUTH_DOMAIN ||= `${vals.FIREBASE_PROJECT_ID}.firebaseapp.com`;
}

// branding.config.json
const brandPath = join(root, "branding.config.json");
const b = JSON.parse(readFileSync(brandPath, "utf8"));
const changed = [];
const set = (obj, key, v, label) => {
  if (v == null || v === "") return;
  if (obj[key] !== v) changed.push(label);
  obj[key] = v;
};
const fb = (b.infrastructure.firebase ||= {});
set(fb, "apiKey", vals.FIREBASE_API_KEY, "Firebase apiKey");
set(fb, "authDomain", vals.FIREBASE_AUTH_DOMAIN, "Firebase authDomain");
set(fb, "projectId", vals.FIREBASE_PROJECT_ID, "Firebase projectId");
set(fb, "storageBucket", vals.FIREBASE_STORAGE_BUCKET, "Firebase storageBucket");
set(fb, "messagingSenderId", vals.FIREBASE_MESSAGING_SENDER_ID, "Firebase messagingSenderId");
set(fb, "appId", vals.FIREBASE_APP_ID, "Firebase appId");
set(b.infrastructure, "stripePublishableKey", vals.STRIPE_PUBLISHABLE_KEY, "Stripe publishable key");
set(b.dispatch, "pushVapidKey", vals.FIREBASE_WEB_PUSH_KEY, "Web Push key");
if (vals.MAP_TILE_URL) {
  b.infrastructure.mapTiles = { url: vals.MAP_TILE_URL, attribution: vals.MAP_TILE_ATTRIBUTION || "&copy; OpenStreetMap contributors" };
  changed.push("map tiles");
}
if (vals.OFFICE_PHONE) {
  const d = vals.OFFICE_PHONE.replace(/\D/g, "");
  if (d.length === 10) {
    set(b.company, "phoneDisplay", `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, "office phone");
    set(b.company, "phoneTel", `+1${d}`, "office phone link");
  } else warn("OFFICE_PHONE should be 10 digits. Skipped.");
}
const num = (k) => (vals[k] != null && Number.isFinite(Number(vals[k])) && Number(vals[k]) >= 0 ? Number(vals[k]) : null);
const rr = (b.rideRules ||= {});
set(rr, "lateCancelFee", num("LATE_CANCEL_FEE"), "late-cancel fee");
set(rr, "noShowFee", num("NO_SHOW_FEE"), "no-show fee");
set(rr, "headsUpMinutes", num("FREE_CANCEL_UNTIL_MINUTES_AWAY"), "free-cancel / alert minutes");
set(rr, "waitGraceMinutes", num("FREE_WAIT_MINUTES"), "free wait minutes");
set(rr, "noShowAfterMinutes", num("NO_SHOW_AFTER_MINUTES"), "no-show minutes");
if (num("DAY_PASS_PRICE") != null && num("DAY_PASS_PRICE") !== 5) {
  warn("DAY_PASS_PRICE: the $5 price is also set in the payment code (functions/index.js PRIORITY_PASS_FEE_CENTS); ask Claude to change both.");
}
writeFileSync(brandPath, JSON.stringify(b, null, 2) + "\n");

// functions/.env: Twilio's non-secret settings (the auth token is a secret).
const envPath = join(root, "functions/.env");
const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const lines = Object.fromEntries(
  env
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_PHONE_NUMBER"]) {
  if (vals[k]) {
    if (lines[k] !== vals[k]) changed.push(k);
    lines[k] = vals[k];
  }
}
writeFileSync(
  envPath,
  "# Non-secret settings read by the server (Firebase params). Secrets go in Cloud Shell, never here.\n" +
    Object.entries(lines)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") +
    "\n"
);

execFileSync(process.execPath, [join(root, "scripts/sync-branding.mjs")], { stdio: "ignore" });

const project = fb.projectId;
console.log(changed.length ? `Updated: ${changed.join(", ")}.` : "Nothing new to update.");
for (const p of problems) console.log(`!  ${p}`);
const missing = ["FIREBASE_PROJECT_ID", "FIREBASE_API_KEY", "FIREBASE_APP_ID", "STRIPE_PUBLISHABLE_KEY"].filter((k) => !vals[k]);
if (missing.length) console.log(`Still blank (needed to go live): ${missing.join(", ")}`);
console.log(`
Next, in Cloud Shell (you type the secret when it asks; it is never shown):
  firebase functions:secrets:set STRIPE_SECRET_KEY --project ${project}
  firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project ${project}
  firebase functions:secrets:set TWILIO_AUTH_TOKEN --project ${project}     (type none if calls aren't set up yet)
  bash scripts/deploy-dispatch.sh
${vals.OWNER_LOGIN_EMAIL ? `  node scripts/make-dispatcher.mjs ${vals.OWNER_LOGIN_EMAIL}` : "  node scripts/make-dispatcher.mjs <owner email>"}
`);
