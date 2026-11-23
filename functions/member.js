// Member perk: free Priority Day Passes each calendar month (owner decision
// Nov 18, 2026: Basic 1, Premium 3; no rollover). A claimed pass is the same
// fast_passes record a paid $5 pass makes (amountCents 0, kind "member"), so
// booking, line priority, map and calling all work the same way.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const BRANDING = require("./branding.json");

const db = () => admin.firestore();
const TIME_ZONE = (BRANDING.dispatch && BRANDING.dispatch.timeZone) || "America/New_York";
const ALLOWANCE = BRANDING.memberDayPasses || {};
const ACTIVE_PLAN = ["active", "trialing"];
let timingPromise = null;
const timing = () => (timingPromise ||= import("./lib/rideTiming.mjs"));

/** "YYYY-MM" in the company's time zone. */
function monthKey(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}`;
}

/** Passes left this month for a user doc (0 without an active plan). */
function passesLeft(user, nowMs) {
  if (!user || !ACTIVE_PLAN.includes(user.subscriptionStatus)) return 0;
  const allowance = Number(ALLOWANCE[user.subscriptionTier]) || 0;
  const used = user.memberPasses?.month === monthKey(nowMs) ? Number(user.memberPasses.used) || 0 : 0;
  return Math.max(0, allowance - used);
}

exports.useMemberDayPass = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const T = await timing();
  const nowMs = Date.now();
  const userRef = db().collection("users").doc(uid);
  return db().runTransaction(async (tx) => {
    const user = (await tx.get(userRef)).data();
    // Already on a pass today: nothing to use up.
    if (user?.dayPass?.expiresAt > nowMs) {
      return { id: user.dayPass.id, expiresAt: user.dayPass.expiresAt, left: passesLeft(user, nowMs), already: true };
    }
    const left = passesLeft(user, nowMs);
    if (left <= 0) {
      throw new HttpsError("failed-precondition", "No free passes left this month. You can still buy one for $5.");
    }
    const key = monthKey(nowMs);
    const used = user.memberPasses?.month === key ? Number(user.memberPasses.used) || 0 : 0;
    const expiresAt = T.endOfLocalDay(nowMs, TIME_ZONE);
    const passRef = db().collection("fast_passes").doc(`member_${uid}_${nowMs}`);
    tx.set(passRef, {
      uid,
      kind: "member",
      amountCents: 0,
      status: "succeeded",
      rideId: null,
      rides: [],
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(userRef, { dayPass: { id: passRef.id, expiresAt }, memberPasses: { month: key, used: used + 1 } }, { merge: true });
    return { id: passRef.id, expiresAt, left: left - 1 };
  });
});

exports._passesLeft = passesLeft;
exports._monthKey = monthKey;
