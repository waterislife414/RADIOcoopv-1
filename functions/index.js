const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Stripe = require("stripe");

admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
// All client-specific values come from branding.json, which is generated
// from /branding.config.json by `npm run sync-branding` (or any build).
const BRANDING = require("./branding.json");
const COMPANY_NAME = BRANDING.companyName;
const DATA_RETENTION_DAYS = BRANDING.dataRetentionDays;
const PRIORITY_PASS_FEE_CENTS = 500; // $5 Priority Day Pass, fixed server-side (company keeps it)
const TIME_ZONE = (BRANDING.dispatch && BRANDING.dispatch.timeZone) || "America/New_York";
const RIDE_RULES = BRANDING.rideRules || {};
const fees = require("./rideFees");
let fareLibPromise = null;
let feeLibPromise = null;
const fareLib = () => (fareLibPromise ||= import("./lib/fareEstimate.mjs"));
const feeLib = () => (feeLibPromise ||= import("./lib/cardFee.mjs"));
let savingsLibPromise = null;
const savingsLib = () => (savingsLibPromise ||= import("./lib/memberSavings.mjs"));

/** $3 off a new member's first card ride: once per account and once per phone number. */
async function welcomeCreditFor(user, uid, deals) {
  const amount = Math.max(0, Math.round(Number(deals.welcomeCreditCents) || 0));
  if (!amount || user.welcomeCreditAt || (Number(user.ridesDone) || 0) > 0) return 0;
  if (user.phone) {
    const same = await db.collection("users").where("phone", "==", user.phone).limit(10).get();
    if (same.docs.some((d) => d.id !== uid && d.data().welcomeCreditAt)) return 0;
  }
  return amount;
}

/** "credit" | "debit" | "prepaid" | "unknown" for the card on this payment (no fee unless "credit"). */
async function cardFunding(stripe, paymentMethodId, holdId) {
  try {
    let pm = paymentMethodId || null;
    if (!pm && holdId) pm = (await stripe.paymentIntents.retrieve(holdId))?.payment_method || null;
    if (!pm) return "unknown";
    const obj = typeof pm === "string" ? await stripe.paymentMethods.retrieve(pm) : pm;
    return obj?.card?.funding || "unknown";
  } catch (e) {
    console.warn("card funding lookup failed", e?.message);
    return "unknown";
  }
}
let timingPromise;
const timing = () => (timingPromise ||= import("./lib/rideTiming.mjs"));
const OUT_OF_AREA_MINIMUM_FARE_CENTS = BRANDING.outOfAreaMinimumFareCents;
const SUBSCRIPTION_TRIAL_DAYS = BRANDING.subscriptionTrialDays;
const BASE_FARE_CENTS = BRANDING.baseFareCents;
const PER_MILE_CENTS = BRANDING.perMileCents;

// Stripe client is created once per warm instance and reused across
// invocations rather than per-request, so the function doesn't pay for a
// fresh TLS handshake on every call.
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY.value());
  }
  return _stripe;
}

function isAdmin(request) {
  return !!(request.auth && request.auth.token && request.auth.token.admin === true);
}

// Monthly price is the source of truth; annual = 11x monthly (1 month free).
const SUBSCRIPTION_MONTHLY_CENTS = BRANDING.tierMonthlyCents;
const SMS_ADDON_MONTHLY_CENTS = 1500; // $15/mo, standalone add-on - not bundled into Basic/Premium

exports.createPaymentIntent = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const stripe = getStripe();
    // The booking hold checks the card and saves it for this ride, so the
    // real fare (or a cancel/no-show fee) can be charged to the same card
    // afterwards. A hold can't be raised later on most cards, so it never has
    // to be: big enough for the no-show fee, the fare is a separate charge.
    const preAuthAmount = Math.max(500, Math.round((RIDE_RULES.noShowFee ?? 10) * 100));
    const uid = request.auth?.uid || null;
    let customer = null;
    if (uid) {
      const userRef = db.collection("users").doc(uid);
      customer = (await userRef.get()).data()?.stripeCustomerId || null;
      if (!customer) {
        customer = (await stripe.customers.create({ metadata: { uid } })).id;
        await userRef.set({ stripeCustomerId: customer }, { merge: true });
      }
    } else {
      customer = (await stripe.customers.create({ metadata: { guest: "true" } })).id;
    }

    // Members can book with the card they used before: one tap, no typing.
    const saved = uid && request.data?.useSaved === true ? await savedCardFor(stripe, customer) : null;
    if (uid && request.data?.useSaved === true && !saved) {
      throw new HttpsError("failed-precondition", "No saved card. Type your card instead.");
    }

    const intent = await stripe.paymentIntents.create({
      amount: preAuthAmount,
      currency: "usd",
      capture_method: "manual",
      customer,
      ...(saved ? { payment_method: saved.id } : { setup_future_usage: "off_session" }),
      metadata: {
        uid: uid || "guest",
      },
    });

    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  }
);

/** The member's most recent saved card, or null. */
async function savedCardFor(stripe, customer) {
  if (!customer) return null;
  try {
    const list = await stripe.paymentMethods.list({ customer, type: "card", limit: 1 });
    const pm = list?.data?.[0];
    return pm ? { id: pm.id, brand: pm.card?.brand || "card", last4: pm.card?.last4 || "" } : null;
  } catch (e) {
    console.warn("saved card lookup failed", e?.message);
    return null;
  }
}

// Booking screen: "Pay with Visa ending 4242" (brand and last 4 only).
exports.mySavedCard = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) return null;
  const customer = (await db.collection("users").doc(uid).get()).data()?.stripeCustomerId;
  const card = await savedCardFor(getStripe(), customer);
  return card ? { brand: card.brand, last4: card.last4 } : null;
});

// ---------- Real recurring subscriptions (trial + monthly/annual) ----------
// Flow: client collects a card via a SetupIntent (no charge yet) ->
// createSubscription attaches that payment method and starts a real Stripe
// Subscription with a 7-day free trial -> Stripe auto-bills at trial end and
// on every renewal after that -> stripeWebhook is the single source of
// truth that flips subscriptionTier/subscriptionStatus in Firestore based on
// what Stripe actually reports, so a client can't fake a successful payment.

async function getOrCreateStripeCustomer(uid, email) {
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const existing = userSnap.exists ? userSnap.data().stripeCustomerId : null;
  if (existing) return existing;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { uid },
  });
  await userRef.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

// ---------- VIP Fast Pass ($5, paid on its own before checkout) ----------
// Charged right away, separately from the ride fare. The ride then carries
// fastPassId; captureFare skips the $5 when that pass is paid.
// The $5 Priority Day Pass: priority, live map and calling on every ride
// until midnight (a guest's pass covers one ride).
async function recordFastPass(intent, uid) {
  const T = await timing();
  // Good until midnight of the day it was paid, whenever this runs. Recorded
  // once: confirming the same payment again can't renew or reset a pass.
  const paidMs = Number.isFinite(intent.created) ? intent.created * 1000 : Date.now();
  const expiresAt = T.endOfLocalDay(paidMs, TIME_ZONE);
  const ref = db.collection("fast_passes").doc(intent.id);
  const fresh = await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.set(ref, {
      uid,
      amountCents: intent.amount,
      status: intent.status,
      rideId: null,
      rides: [],
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (fresh && uid && uid !== "guest") {
    await db.collection("users").doc(uid).set({ dayPass: { id: intent.id, expiresAt } }, { merge: true });
  }
}

exports.payFastPass = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const { paymentMethodId } = request.data || {};
  if (typeof paymentMethodId !== "string" || !paymentMethodId) {
    throw new HttpsError("invalid-argument", "A card is required.");
  }
  const uid = request.auth ? request.auth.uid : "guest";
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: PRIORITY_PASS_FEE_CENTS,
    currency: "usd",
    payment_method: paymentMethodId,
    payment_method_types: ["card"],
    confirm: true,
    description: "Priority Day Pass",
    metadata: { kind: "fast-pass", uid },
  });
  if (intent.status === "succeeded") await recordFastPass(intent, uid);
  return { id: intent.id, status: intent.status, clientSecret: intent.status === "requires_action" ? intent.client_secret : null };
});

// After the bank's extra check (3-D Secure), record the pass once Stripe says it's paid.
exports.confirmFastPass = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const { id } = request.data || {};
  if (typeof id !== "string" || !id) throw new HttpsError("invalid-argument", "Missing payment.");
  const intent = await getStripe().paymentIntents.retrieve(id);
  if (intent.status !== "succeeded" || intent.amount !== PRIORITY_PASS_FEE_CENTS || intent.metadata?.kind !== "fast-pass") {
    throw new HttpsError("failed-precondition", "That Day Pass payment didn't go through.");
  }
  await recordFastPass(intent, intent.metadata.uid || "guest");
  return { id: intent.id, status: intent.status };
});

/** True when the ride's Fast Pass was already paid on its own (claims it for this ride). */
async function fastPassPaid(ride, rideId) {
  if (!ride.fastPassId) return false;
  const T = await timing();
  const ref = db.collection("fast_passes").doc(String(ride.fastPassId));
  const snap = await ref.get();
  const pass = snap.exists ? snap.data() : null;
  // A pass checked at the end of a ride counts if it was good when the ride was booked.
  const bookedMs = ride.timestamp?.toMillis ? ride.timestamp.toMillis() : Date.now();
  if (!T.isDayPassValid(pass, ride.customerId, rideId, Math.min(bookedMs, Date.now()))) return false;
  if (pass.uid === "guest" || pass.expiresAt == null) {
    if (!pass.rideId) await ref.update({ rideId });
  } else {
    await ref.update({ rides: admin.firestore.FieldValue.arrayUnion(rideId) });
  }
  return true;
}

exports.createSubscriptionSetupIntent = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to start a plan.");
    }
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(
      request.auth.uid,
      request.auth.token.email
    );

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
    });

    return { clientSecret: setupIntent.client_secret, stripeCustomerId: customerId };
  }
);

exports.startSubscription = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to start a plan.");
    }
    const { tier, billingCycle, paymentMethodId } = request.data;
    const isSmsAddon = tier === "SMS_ADDON";
    const monthlyCents = isSmsAddon ? SMS_ADDON_MONTHLY_CENTS : SUBSCRIPTION_MONTHLY_CENTS[tier];
    if (!monthlyCents) {
      throw new HttpsError("invalid-argument", "Unknown subscription tier.");
    }
    if (!paymentMethodId) {
      throw new HttpsError("invalid-argument", "paymentMethodId is required.");
    }
    // The SMS add-on is monthly-only (no annual option) - it's priced to
    // just cover a real ongoing per-message cost, not to be prepaid.
    const isAnnual = !isSmsAddon && billingCycle === "annual";
    const amount = isAnnual ? monthlyCents * 11 : monthlyCents;
    const interval = isAnnual ? "year" : "month";

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(
      request.auth.uid,
      request.auth.token.email
    );

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amount,
            recurring: { interval },
            product_data: { name: isSmsAddon ? `${COMPANY_NAME} SMS Ride Alerts` : `${COMPANY_NAME} ${tier} Plan` },
          },
        },
      ],
      trial_period_days: SUBSCRIPTION_TRIAL_DAYS,
      default_payment_method: paymentMethodId,
      metadata: { uid: request.auth.uid, tier, billingCycle: billingCycle || "monthly" },
    });

    await db
      .collection("users")
      .doc(request.auth.uid)
      .set(
        isSmsAddon
          ? {
              smsAddonStatus: subscription.status,
              smsAddonSubscriptionId: subscription.id,
            }
          : {
              subscriptionTier: tier,
              subscriptionStatus: subscription.status,
              subscriptionBillingCycle: billingCycle || "monthly",
              stripeSubscriptionId: subscription.id,
            },
        { merge: true }
      );

    return { success: true, status: subscription.status };
  }
);

// Single source of truth for subscription state. Stripe calls this
// directly — it does not trust anything the client says.
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = getStripe();
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      const obj = event.data.object;

      async function findUserAndKind(subscriptionId) {
        let snap = await db
          .collection("users")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .limit(1)
          .get();
        if (!snap.empty) return { ref: snap.docs[0].ref, kind: "plan" };

        snap = await db
          .collection("users")
          .where("smsAddonSubscriptionId", "==", subscriptionId)
          .limit(1)
          .get();
        if (!snap.empty) return { ref: snap.docs[0].ref, kind: "sms" };

        return null;
      }

      async function applyStatus(subscriptionId, statusUpdates) {
        const found = await findUserAndKind(subscriptionId);
        if (!found) return;
        const { ref, kind } = found;
        if (kind === "sms") {
          await ref.set({ smsAddonStatus: statusUpdates.status }, { merge: true });
        } else {
          const update = { subscriptionStatus: statusUpdates.status };
          if (statusUpdates.clearTier) update.subscriptionTier = null;
          await ref.set(update, { merge: true });
        }
      }

      if (event.type === "customer.subscription.updated") {
        await applyStatus(obj.id, { status: obj.status });
      } else if (event.type === "customer.subscription.deleted") {
        await applyStatus(obj.id, { status: "cancelled", clearTier: true });
      } else if (event.type === "invoice.payment_failed") {
        const subscriptionId = obj.subscription;
        if (subscriptionId) {
          await applyStatus(subscriptionId, { status: "payment_failed", clearTier: true });
        }
      } else if (event.type === "invoice.payment_succeeded") {
        const subscriptionId = obj.subscription;
        if (subscriptionId) {
          await applyStatus(subscriptionId, { status: "active" });
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Webhook handler error:", err);
      res.status(500).send("Webhook handler error");
    }
  }
);

// ---------- Self-checkout: the rider pays themselves ----------
// The customer enters the meter fare + tip and confirms their own card.
// The dispatcher never enters a dollar amount for a self-checkout ride —
// they only ever see whether it's been paid. A "Force Manual Capture"
// override still exists for the rare case a passenger can't/won't pay
// through the app themselves.
exports.captureFare = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const { rideId, meterFare, tipAmount, paymentMethodId, preview, riderApproved } = request.data;
    // The driver's phone measured the trip too (GPS): kept next to the meter to compare, never charged.
    const appMeterCents = Number.isFinite(request.data?.appMeterCents) && request.data.appMeterCents > 0 ? Math.min(Math.round(request.data.appMeterCents), 100000) : null;

    if (!rideId || typeof meterFare !== "number" || meterFare <= 0) {
      throw new HttpsError("invalid-argument", "rideId and meterFare are required.");
    }
    const tipIn = typeof tipAmount === "number" && tipAmount >= 0 ? tipAmount : 0;

    const rideRef = db.collection("rides").doc(rideId);
    const rideSnap = await rideRef.get();
    if (!rideSnap.exists) {
      throw new HttpsError("not-found", "Ride not found.");
    }
    const ride = rideSnap.data();
    if (ride.finalFare != null) throw new HttpsError("already-exists", "This fare is already paid.");
    if (request.auth?.uid === ride.customerId && !isAdmin(request) && ride.paymentMethod !== "card") {
      throw new HttpsError("failed-precondition", "This ride is paid in cash or from your balance, not by card here.");
    }

    const requesterIsRider = request.auth && request.auth.uid === ride.customerId;
    const requesterIsAdmin = isAdmin(request);
    // The driver on the trip types the meter at drop-off; the card the booking saved is charged.
    const requesterIsDriver = !!request.auth?.uid && request.auth.token?.driver === true && ride.driverId === request.auth.uid;
    if (!requesterIsRider && !requesterIsAdmin && !requesterIsDriver) {
      throw new HttpsError(
        "permission-denied",
        "Only the rider, the driver on this trip, or a dispatcher can settle this fare."
      );
    }
    const driverSettling = requesterIsDriver && !requesterIsAdmin && !requesterIsRider;
    if (driverSettling) {
      if (ride.paymentMethod !== "card" || !ride.paymentIntentId) {
        throw new HttpsError("failed-precondition", "Only card rides with a card on file are charged from the driver's phone.");
      }
      if (!["in_transit", "finished"].includes(ride.status)) {
        throw new HttpsError("failed-precondition", "Pick up the rider first.");
      }
      if (paymentMethodId) throw new HttpsError("invalid-argument", "The driver charges the card on file only.");
    }

    // A typed meter far above the trip estimate goes to the office, not onto the card,
    // unless the rider approves it on the driver's phone. After a drop-off change or a stop
    // the estimate no longer fits the trip: only the overall cap applies.
    const F = await fareLib();
    const changedTrip = !!ride.routeChangedAt || (Number(ride.stopCount) || 0) > 0;
    const check = F.meterCheck({
      meterCents: Math.round(meterFare * 100),
      estMiles: changedTrip ? null : ride.estMiles,
      fare: BRANDING.fare,
      passengers: ride.passengers || 1,
      cfg: BRANDING.driverMeter || {},
      estimateCfg: BRANDING.estimate || {},
    });
    const capCheck = F.meterCheck({ meterCents: Math.round(meterFare * 100), estMiles: null, fare: BRANDING.fare, cfg: BRANDING.driverMeter || {} });
    const overEstimate = !check.ok && capCheck.ok;
    const riderOks = driverSettling && (preview === true || riderApproved === true);
    if (!requesterIsAdmin && !check.ok && !(overEstimate && (riderOks || requesterIsRider))) {
      throw new HttpsError(
        "failed-precondition",
        `That's more than this trip should cost (limit $${(check.limitCents / 100).toFixed(2)}). Check the meter, or call the office to settle it.`
      );
    }

    // Mandatory fare floor: out-of-area trips are never captured for less
    // than the posted minimum, no matter what was entered.
    let effectiveMeterFare = meterFare;
    if (ride.outOfArea && Math.round(meterFare * 100) < OUT_OF_AREA_MINIMUM_FARE_CENTS) {
      effectiveMeterFare = OUT_OF_AREA_MINIMUM_FARE_CENTS / 100;
    }

    const meterCents = Math.round(effectiveMeterFare * 100);

    // Tip: the rider picks it, on their own phone or when they approve the charge on the
    // driver's phone. A driver alone never adds one. At most $20 or the meter, whichever is more.
    let tipCents = Math.round(tipIn * 100);
    if (driverSettling && riderApproved !== true) tipCents = 0;
    tipCents = Math.min(tipCents, Math.max(2000, meterCents));
    const tip = tipCents / 100;

    // Member deals: Price Lock and ride credit (the company pays both; the driver keeps
    // the full meter less the card company's cut). Branding pricing.memberDeals / cardCost.
    const SAV = await savingsLib();
    const isCard = ride.paymentMethod === "card";
    const deals = { ...SAV.MEMBER_DEALS_DEFAULTS, ...(BRANDING.memberDeals || {}) };
    const member = isCard && SAV.isMember(ride);
    const userRef = member ? db.collection("users").doc(ride.customerId) : null;
    const userDoc = member ? (await userRef.get()).data() || {} : {};
    const welcomeCents = member ? await welcomeCreditFor(userDoc, ride.customerId, deals) : 0;
    const capCents = member
      ? SAV.priceLockCapCents({
          ride,
          fare: BRANDING.fare,
          estimateCfg: BRANDING.estimate || {},
          waitPerMinuteCents: BRANDING.waitPerMinuteCents,
          waitGraceMinutes: RIDE_RULES.waitGraceMinutes ?? 2,
          deals,
        })
      : null;
    const bd = SAV.fareBreakdown({
      meterCents,
      tipCents,
      capCents,
      creditCents: member ? Math.max(0, Math.round(Number(userDoc.rideCreditCents) || 0)) + welcomeCents : 0,
      cost: BRANDING.cardCost || {},
      card: isCard,
    });

    // Card fee: none (owner decision Nov 23: same price cash or card). The other modes in
    // pricing.cardFee stay switchable: credit_surcharge (credit up to 3%, debit $0) or flat.
    const stripe = getStripe();
    const feeMode = BRANDING.cardFee?.mode || "none";
    const funding = isCard && feeMode === "credit_surcharge" ? await cardFunding(stripe, paymentMethodId, ride.paymentIntentId) : null;
    const cardFeeCents =
      isCard && feeMode !== "none"
        ? (await feeLib()).cardFeeCents({ baseCents: bd.chargeCents, funding: funding || "unknown", member: !!requesterIsRider, cfg: BRANDING.cardFee })
        : 0;
    const memberDiscountApplied = feeMode === "flat" && !!requesterIsRider;
    const priorityPassCents =
      ride.wantsPriorityPass && !(await fastPassPaid(ride, rideId)) ? PRIORITY_PASS_FEE_CENTS : 0;

    // The driver's phone shows this to the rider before they approve: nothing is charged.
    if (preview === true) {
      return {
        preview: true,
        ...bd,
        cardFeeCents,
        priorityPassCents,
        welcomeCents,
        capCents,
        totalCents: bd.chargeCents + cardFeeCents + priorityPassCents,
        // More than the estimate: the rider's screen says so before they tap Pay.
        overEstimate,
        estFareCents: check.estFareCents,
        tripChanged: changedTrip,
      };
    }

    // Cancel/no-show fees the rider still owes from an earlier ride ride along
    // on their own card checkout (they were told in the terms and on screen).
    let owed = [];
    let owedCents = 0;
    if (requesterIsRider && paymentMethodId && ride.paymentMethod === "card") {
      const u = (await db.collection("users").doc(ride.customerId).get()).data() || {};
      owed = Array.isArray(u.feesOwed) ? u.feesOwed : [];
      owedCents = owed.reduce((n, f) => n + Math.max(0, Math.round(f.cents || 0)), 0);
    }

    const totalCents = bd.chargeCents + cardFeeCents + priorityPassCents + owedCents;

    // Claim the fare before charging so two taps (or a retry) can't charge twice.
    // Ride credit is taken in the same step and given back if the card fails.
    const creditUsed = bd.creditUsedCents;
    const welcomeUsed = Math.min(welcomeCents, creditUsed);
    const balanceUsed = creditUsed - welcomeUsed;
    const claimedAt = Date.now();
    await db.runTransaction(async (tx) => {
      const r = (await tx.get(rideRef)).data() || {};
      const u = balanceUsed > 0 ? (await tx.get(userRef)).data() || {} : null;
      if (r.finalFare != null) throw new HttpsError("already-exists", "This fare is already paid.");
      if (r.settlingAt && claimedAt - r.settlingAt < 120000) throw new HttpsError("aborted", "Payment is already going through. One moment.");
      if (u && Math.round(Number(u.rideCreditCents) || 0) < balanceUsed) throw new HttpsError("aborted", "The ride credit changed. Try again.");
      tx.update(rideRef, { settlingAt: claimedAt });
      if (creditUsed > 0) {
        tx.set(
          userRef,
          {
            ...(balanceUsed > 0 ? { rideCreditCents: admin.firestore.FieldValue.increment(-balanceUsed) } : {}),
            ...(welcomeUsed > 0 ? { welcomeCreditAt: claimedAt } : {}),
          },
          { merge: true }
        );
      }
    });
    const release = async () => {
      await rideRef.update({ settlingAt: null }).catch(() => {});
      if (creditUsed > 0) {
        await userRef
          .set(
            {
              ...(balanceUsed > 0 ? { rideCreditCents: admin.firestore.FieldValue.increment(balanceUsed) } : {}),
              ...(welcomeUsed > 0 ? { welcomeCreditAt: admin.firestore.FieldValue.delete() } : {}),
            },
            { merge: true }
          )
          .catch(() => {});
      }
    };

    let stripeStatus = "manual_override";
    let balanceOwedCents = 0;
    try {

    if (isCard && totalCents === 0) {
      // Ride credit covered it all: nothing to charge. Let go of the booking hold.
      if (ride.paymentIntentId) await stripe.paymentIntents.cancel(ride.paymentIntentId).catch(() => {});
      stripeStatus = "succeeded";
    } else if (isCard) {
      if (requesterIsRider && paymentMethodId) {
        // Self-checkout: the rider confirms their own charge right now.
        const intent = await stripe.paymentIntents.create({
          amount: totalCents,
          currency: "usd",
          customer: (await db.collection("users").doc(ride.customerId).get()).data()
            ?.stripeCustomerId,
          payment_method: paymentMethodId,
          confirm: true,
          off_session: false,
          metadata: { rideId, uid: ride.customerId },
        }, { idempotencyKey: `fare_${rideId}_${totalCents}` });
        stripeStatus = intent.status;
        if (intent.status === "succeeded" && owedCents > 0) await fees.settleOwedFees(ride.customerId, owed);
        // They paid with a card just now: let go of the booking hold.
        if (intent.status === "succeeded" && ride.paymentIntentId) {
          await stripe.paymentIntents.cancel(ride.paymentIntentId).catch(() => {});
        }
      } else if (ride.paymentIntentId) {
        // Office or driver settles a card ride: charge the fare to the card the
        // booking hold saved, then release the hold. If the bank asks the rider
        // to approve it, take what the hold covers and record the rest as owed.
        const r = await fees.chargeSavedCard({ stripe, ride, rideId, cents: totalCents, key: `fare_${rideId}_${totalCents}` });
        if (r.chargedCents === 0) {
          throw new HttpsError("failed-precondition", "The rider's card didn't go through. Collect cash, or have them pay in the app.");
        }
        stripeStatus = "succeeded";
        if (r.owedCents > 0 && r.chargedCents > 0) {
          balanceOwedCents = r.owedCents;
          await fees.recordOwed(ride, rideId, r.owedCents, "fare_balance");
        }
      }
    }
    } catch (e) {
      await release();
      throw e;
    }

    await rideRef.update({
      finalFare: effectiveMeterFare,
      tipAmount: tip,
      capturedAmountCents: totalCents,
      stripeStatus,
      cardFeeCents,
      ...(owedCents > 0 && stripeStatus === "succeeded" ? { earlierFeesCents: owedCents } : {}),
      ...(balanceOwedCents > 0 ? { balanceOwedCents } : {}),
      memberDiscountApplied,
      cardFunding: funding,
      // Member deals and the card company's cut (see functions/lib/memberSavings.mjs).
      lockOffCents: bd.lockOffCents,
      ...(appMeterCents != null ? { appMeterCents } : {}),
      creditUsedCents: creditUsed,
      fareChargedCents: bd.fareChargeCents,
      driverCardCostCents: bd.driverCardCostCents,
      ...(driverSettling && riderApproved === true ? { riderApproved: true, tipAddedAt: Date.now() } : {}),
      ...(requesterIsRider && tipCents > 0 ? { tipAddedAt: Date.now() } : {}),
      // For learning prices from real meters (see suggestRoadFactor).
      meterCents: Math.round(effectiveMeterFare * 100),
      estFareCents: check.estFareCents,
      meterEnteredBy: driverSettling ? "driver" : requesterIsRider ? "rider" : "office",
      settlingAt: null,
      settledBy: driverSettling ? "driver" : requesterIsAdmin && !requesterIsRider ? "dispatcher_override" : "customer",
    });

    return { success: true, status: stripeStatus, memberDiscountApplied };
  }
);

// Rider adds a tip on the receipt after the driver charged the meter: once per
// ride, to the card the booking saved, credited to the driver's lick ledger.
exports.addTip = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const rideId = String(request.data?.rideId || "");
  const tipCents = Math.round(Number(request.data?.tipCents));
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(rideId) || !Number.isFinite(tipCents) || tipCents < 0) {
    throw new HttpsError("invalid-argument", "Pick a tip.");
  }
  const rideRef = db.collection("rides").doc(rideId);
  const ride = await db.runTransaction(async (tx) => {
    const r = (await tx.get(rideRef)).data();
    if (!r || r.customerId !== uid) throw new HttpsError("not-found", "Ride not found.");
    if (r.paymentMethod !== "card" || r.finalFare == null || r.stripeStatus !== "succeeded") {
      throw new HttpsError("failed-precondition", "Tips are added after a card fare is paid.");
    }
    if (r.tipAddedAt != null || Number(r.tipAmount) > 0) throw new HttpsError("already-exists", "You already chose a tip for this ride.");
    const cap = Math.max(10000, Math.round(Number(r.finalFare) * 100));
    if (tipCents > cap) throw new HttpsError("invalid-argument", `Tips up to $${(cap / 100).toFixed(2)}.`);
    tx.update(rideRef, { tipAddedAt: Date.now() });
    return r;
  });
  if (tipCents === 0) {
    await rideRef.update({ tipAmount: 0 });
    return { ok: true, tipCents: 0 };
  }
  const r = await fees.chargeSavedCard({ stripe: getStripe(), ride, rideId, cents: tipCents, key: `tip_${rideId}_${tipCents}` });
  if (!(r.chargedCents > 0)) {
    await rideRef.update({ tipAddedAt: null });
    throw new HttpsError("failed-precondition", "Your card didn't go through for the tip. You can tip your driver in cash.");
  }
  await rideRef.update({ tipAmount: r.chargedCents / 100, tipChargedCents: r.chargedCents });
  await require("./lease")._creditLateTip(ride.driverId, rideId, r.chargedCents).catch((e) => console.error("tip credit", rideId, e));
  return { ok: true, tipCents: r.chargedCents };
});

// Dispatcher calls in the total, and it's deducted from the customer's
// stored Radio Co-op wallet balance (a prepaid/loaded balance) rather than
// running a new card charge. Admin-only, and uses a transaction so two
// dispatchers can't double-charge the same ride or push a balance negative.
exports.chargeWallet = onCall(async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only a dispatcher can charge a wallet balance.");
  }
  const { rideId, amount } = request.data;
  if (!rideId || typeof amount !== "number" || amount <= 0) {
    throw new HttpsError("invalid-argument", "rideId and a positive amount are required.");
  }

  const rideRef = db.collection("rides").doc(rideId);
  const amountCents = Math.round(amount * 100);

  const result = await db.runTransaction(async (tx) => {
    const rideSnap = await tx.get(rideRef);
    if (!rideSnap.exists) {
      throw new HttpsError("not-found", "Ride not found.");
    }
    const ride = rideSnap.data();
    if (ride.finalFare != null) {
      throw new HttpsError("failed-precondition", "This ride has already been settled.");
    }
    if (!ride.customerId || ride.customerId === "guest") {
      throw new HttpsError(
        "failed-precondition",
        "This ride has no linked account - guests don't have a wallet balance."
      );
    }

    const userRef = db.collection("users").doc(ride.customerId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Customer account not found.");
    }
    const currentBalanceCents = Math.round((userSnap.data().walletBalance || 0) * 100);
    if (currentBalanceCents < amountCents) {
      throw new HttpsError(
        "failed-precondition",
        `Insufficient wallet balance: customer has $${(currentBalanceCents / 100).toFixed(2)}, charge is $${amount.toFixed(2)}.`
      );
    }

    const newBalanceCents = currentBalanceCents - amountCents;
    tx.update(userRef, { walletBalance: newBalanceCents / 100 });
    tx.update(rideRef, {
      finalFare: amount,
      tipAmount: 0,
      capturedAmountCents: amountCents,
      stripeStatus: "wallet_charge",
      settledBy: "dispatcher_wallet_charge",
    });

    return { newBalance: newBalanceCents / 100 };
  });

  return { success: true, newBalance: result.newBalance };
});

// Emails the customer when their ride is dispatched. This writes to a
// "mail" collection in the exact document shape Firebase's official
// "Trigger Email" extension expects - install that extension (free) from
// the Firebase Console and point it at your own SendGrid/SMTP account, and
// this starts sending automatically with zero further code changes. Until
// that extension is installed and configured, these documents are written
// but nothing actually sends - that one-time setup has to happen with
// Jared's own SMTP/SendGrid credentials, which live outside this codebase.
exports.onRideDispatched = onDocumentUpdated("rides/{rideId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.status === "dispatched" || after.status !== "dispatched") return;
  if (!after.customerId || after.customerId === "guest") return;

  const userSnap = await db.collection("users").doc(after.customerId).get();
  if (!userSnap.exists || !userSnap.data().email) return;
  const { email, firstName } = userSnap.data();

  await db.collection("mail").add({
    to: email,
    message: {
      subject: `${COMPANY_NAME}: Your driver is on the way!`,
      text: `Hi ${firstName || "there"}, your ${COMPANY_NAME} driver has been dispatched and is on the way to ${after.pickup}. Call us for details or an ETA.`,
      html: `<p>Hi ${firstName || "there"},</p><p>Your ${COMPANY_NAME} driver has been dispatched and is on the way to <strong>${after.pickup}</strong>.</p><p>Call us if you'd like an ETA or have any questions.</p>`,
    },
  });
});

// Rider cancels their own ride before a driver is assigned. The card hold is
// released, a copy is kept in cancelled_rides, and the ride is removed (the
// onRideDeleted trigger frees any driver who was being offered the call).
exports.cancelMyRide = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to cancel.");
  const rideId = String(request.data?.rideId || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(rideId)) throw new HttpsError("invalid-argument", "Missing ride.");
  // The fee the rider saw and agreed to on screen; if the driver got close
  // in the meantime, they're asked again instead of being charged more.
  const acceptFeeCents = Math.max(0, Math.round(Number(request.data?.acceptFeeCents) || 0));
  const T = await timing();
  const rules = T.rulesFrom(RIDE_RULES);
  const ref = db.collection("rides").doc(rideId);
  const nowMs = Date.now();
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = snap.exists ? snap.data() : null;
    if (!r || r.customerId !== uid) throw new HttpsError("not-found", "Ride not found.");
    const boardSnap = r.driverId ? await tx.get(db.collection("board").doc(r.driverId)) : null;
    const driverOnIt = !!boardSnap?.exists && boardSnap.data().rideId === rideId;
    const quoted = T.cancelQuote(r, nowMs, rules);
    // No fee if the driver isn't actually on this ride any more.
    const q = quoted.allowed && quoted.feeCents > 0 && !driverOnIt ? { ...quoted, feeCents: 0 } : quoted;
    if (!q.allowed) {
      throw new HttpsError(
        "failed-precondition",
        q.reason === "riding" ? "You're already on your ride." : "A driver is already on the way. Please call us to cancel."
      );
    }
    if (q.why === "no_driver") {
      tx.set(db.collection("cancelled_rides").doc(rideId), {
        ...r,
        cancelledBy: "rider",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.delete(ref);
      return { ride: r, feeCents: 0 };
    }
    if (q.feeCents > acceptFeeCents) {
      throw new HttpsError("failed-precondition", `Your driver is close now, so cancelling costs $${(q.feeCents / 100).toFixed(2)}.`, {
        feeCents: q.feeCents,
      });
    }
    // A driver was on the way: free him up and tell him.
    tx.update(ref, { status: "cancelled", cancelledBy: "rider", cancelledAt: nowMs, cancelFeeCents: q.feeCents });
    if (r.driverId && driverOnIt) {
      tx.set(
        db.collection("board").doc(r.driverId),
        {
          status: "moving",
          zoneId: null,
          lineKey: null,
          rideId: null,
          lastEvent: { type: "rider_cancelled", at: nowMs, feeCents: q.feeCents },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(db.collection("driverInbox").doc(r.driverId), { current: null, notice: { text: "The rider cancelled.", at: nowMs } }, { merge: true });
    }
    return { ride: r, feeCents: q.feeCents };
  });
  const { ride, feeCents } = out;
  if (feeCents > 0) {
    const f = await fees.chargeRideFee({ stripe: getStripe(), ride, rideId, cents: feeCents, kind: "late_cancel_fee" });
    // Tell the driver what actually happened to the fee.
    const text =
      f.chargedCents > 0
        ? `The rider cancelled. $${(f.chargedCents / 100).toFixed(2)} cancel fee goes to your lease credit.`
        : `The rider cancelled. They owe the $${(feeCents / 100).toFixed(2)} cancel fee; it goes to your lease credit when they pay.`;
    if (ride.driverId) await db.collection("driverInbox").doc(ride.driverId).set({ notice: { text, at: Date.now() } }, { merge: true });
  } else if (ride.paymentMethod === "card" && ride.paymentIntentId) {
    try {
      await getStripe().paymentIntents.cancel(ride.paymentIntentId);
    } catch {
      // Hold may already be released.
    }
  }
  return { cancelled: true, feeCents };
});

exports.declineRide = onCall(async (request) => {
  if (!isAdmin(request)) throw new HttpsError("permission-denied", "Dispatchers only.");
  const { rideId } = request.data;

  if (!rideId) {
    throw new HttpsError("invalid-argument", "rideId is required.");
  }

  const rideSnap = await db.collection("rides").doc(rideId).get();
  if (rideSnap.exists) {
    const ride = rideSnap.data();

    if (ride.paymentMethod === "card" && ride.paymentIntentId) {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.cancel(ride.paymentIntentId);
      } catch (err) {
        // Hold may already be expired/cancelled; ignore.
      }
    }
  }

  return { success: true };
});

exports.onSubscriptionRideComplete = onDocumentUpdated(
  "rides/{rideId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.status !== "finished" && after.status === "finished") {
      if (after.customerId && after.customerId !== "guest") {
        const userRef = db.collection("users").doc(after.customerId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) return;

        const user = userSnap.data();
        const activeStatuses = ["active", "trialing"];
        if (!activeStatuses.includes(user.subscriptionStatus)) return;

        const countSnap = await db
          .collection("rides")
          .where("customerId", "==", after.customerId)
          .where("status", "==", "finished")
          .count()
          .get();

        const completedRides = countSnap.data().count;

        if (user.subscriptionTier && completedRides > 0 && completedRides % 10 === 0) {
          // Every 10th ride: Basic gets a free entry (base fare); Premium gets
          // a free entry + one free mile. Both come from the real meter rate
          // in branding.json - never hardcode fare numbers here.
          let creditCents = 0;
          if (user.subscriptionTier === "BASIC") {
            creditCents = BASE_FARE_CENTS;
          } else if (user.subscriptionTier === "PREMIUM") {
            creditCents = BASE_FARE_CENTS + PER_MILE_CENTS;
          }
          const credit = creditCents / 100;
          if (credit > 0) {
            await userRef.update({
              walletBalance: admin.firestore.FieldValue.increment(credit),
            });
          }
        }
      }
    }
  }
);

exports.onUserSubscribed = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    const justSubscribed = !before.subscriptionTier && after.subscriptionTier;

    if (justSubscribed && after.referredBy) {
      const referrerQuery = await db
        .collection("users")
        .where("referralCode", "==", after.referredBy)
        .limit(1)
        .get();

      if (!referrerQuery.empty) {
        const referrerDoc = referrerQuery.docs[0];
        await referrerDoc.ref.update({
          walletBalance: admin.firestore.FieldValue.increment(5.0),
        });
      }
    }
  }
);

const BIRTHDAY_CREDIT_AMOUNT = 5.0;

// Runs once a day. Only ID-verified users are eligible (anti-fraud - an
// unverified DOB could just be made up to farm free credit). Tracks
// lastBirthdayCreditYear so it only ever fires once per person per year,
// even if the function happens to run more than once on the same day.
exports.grantBirthdayCredits = onSchedule(
  { schedule: "every day 07:00", timeZone: "America/New_York" },
  async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const year = now.getFullYear();

    const verifiedSnap = await db.collection("users").where("idVerified", "==", true).get();
    let granted = 0;

    for (const docSnap of verifiedSnap.docs) {
      const user = docSnap.data();
      if (!user.dob) continue;
      const dobDate = new Date(user.dob);
      if (dobDate.getMonth() + 1 !== month || dobDate.getDate() !== day) continue;
      if (user.lastBirthdayCreditYear === year) continue;

      await docSnap.ref.update({
        walletBalance: admin.firestore.FieldValue.increment(BIRTHDAY_CREDIT_AMOUNT),
        lastBirthdayCreditYear: year,
      });
      granted++;
    }

    console.log(`Granted birthday credit to ${granted} user(s).`);
    return null;
  }
);

exports.purgeStaleGuestRides = onSchedule(
  { schedule: "every day 03:00", timeZone: "America/New_York" },
  async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DATA_RETENTION_DAYS);
    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

    const staleQuery = await db
      .collection("rides")
      .where("customerId", "==", "guest")
      .where("status", "in", ["finished", "cancelled"])
      .where("timestamp", "<=", cutoffTs)
      .get();

    const bulkWriter = db.bulkWriter();
    let count = 0;

    staleQuery.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status !== "flagged") {
        bulkWriter.delete(docSnap.ref);
        count++;
      }
    });

    await bulkWriter.close();

    console.log(`Purged ${count} stale guest ride records.`);
    return null;
  }
);

// Driver accounts, zones, board, auto-dispatch, dispatcher controls, lease,
// close-out, incentives, phone quick entry. Keys starting with "_" are
// internal helpers, not deployed functions.
const featureModules = [
  require("./drivers"),
  require("./zones"),
  require("./board"),
  require("./dispatch"),
  require("./dispatcher"),
  require("./lease"),
  require("./closeout"),
  require("./incentives"),
  require("./phone"),
  require("./record"),
  require("./inspections"),
  require("./callIssues"),
  require("./rideLive"),
  require("./support"),
  require("./account"),
  require("./member"),
  require("./selfCheck"),
];
for (const mod of featureModules) {
  for (const [name, fn] of Object.entries(mod)) if (!name.startsWith("_")) exports[name] = fn;
}
