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

// ---------------------------------------------------------------------------
// Rewards (owner decision Nov 23, 2026): every finished app ride of $5 or more
// counts for a signed-in rider (ridesDone). Plan members also count toward a
// reward: every 10 counted rides adds ride credit (Basic $5, Premium $10),
// which comes off their next card ride automatically.
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
let savingsPromise = null;
const savings = () => (savingsPromise ||= import("./lib/memberSavings.mjs"));
const DONE = ["finished", "archived"];

exports.countMemberRide = onDocumentUpdated("rides/{rideId}", async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (DONE.includes(before.status) || !DONE.includes(after.status) || after.rewardCountedAt) return;
  const S = await savings();
  const deals = { ...S.MEMBER_DEALS_DEFAULTS, ...(BRANDING.memberDeals || {}) };
  if (!S.isMember(after)) return;
  const rideRef = event.data.after.ref;
  const userRef = db().collection("users").doc(after.customerId);
  const counts = S.countsForReward(after, deals);
  await db().runTransaction(async (tx) => {
    const [r, u] = await Promise.all([tx.get(rideRef), tx.get(userRef)]);
    if (!u.exists || r.data()?.rewardCountedAt) return;
    const user = u.data() || {};
    const plan = ACTIVE_PLAN.includes(user.subscriptionStatus) ? user.subscriptionTier : null;
    const tierCents = Number((BRANDING.tierRewardCents || {})[plan]) || 0;
    const update = { ridesDone: admin.firestore.FieldValue.increment(1) };
    const rideUpdate = { rewardCountedAt: Date.now() };
    if (counts && tierCents > 0) {
      const counted = (Number(user.rewardRides) || 0) + 1;
      update.rewardRides = counted;
      const earned = S.rewardFor(counted, tierCents, deals);
      if (earned > 0) {
        update.rideCreditCents = admin.firestore.FieldValue.increment(earned);
        update.lastRewardAt = Date.now();
        rideUpdate.rewardEarnedCents = earned;
      }
    }
    tx.set(userRef, update, { merge: true });
    tx.update(rideRef, rideUpdate);
  });
});

// Receipt: "Something wrong with this charge?" One tap; the office sees it with the
// meter and the estimate side by side, and calls the rider.
exports.reportCharge = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const rideId = String(request.data?.rideId || "");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(rideId)) throw new HttpsError("invalid-argument", "Ride not found.");
  const rideRef = db().collection("rides").doc(rideId);
  return db().runTransaction(async (tx) => {
    const ride = (await tx.get(rideRef)).data();
    if (!ride || ride.customerId !== uid) throw new HttpsError("not-found", "Ride not found.");
    if (ride.finalFare == null) throw new HttpsError("failed-precondition", "This ride isn't charged yet.");
    if (ride.chargeQuestionAt) return { ok: true, already: true };
    const at = Date.now();
    tx.update(rideRef, { chargeQuestionAt: at });
    tx.set(db().collection("owner_inbox").doc(`charge_${rideId}`), {
      type: "charge_question",
      rideId,
      uid,
      driverId: ride.driverId || null,
      carNumber: ride.carNumber || null,
      phone: ride.phone || null,
      meterCents: ride.meterCents ?? Math.round(Number(ride.finalFare) * 100),
      estFareCents: ride.estFareCents ?? null,
      chargedCents: ride.capturedAmountCents ?? null,
      enteredBy: ride.meterEnteredBy || null,
      at,
      open: true,
    });
    return { ok: true };
  });
});
