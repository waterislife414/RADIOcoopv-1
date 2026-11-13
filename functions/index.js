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
const CARD_APP_FEE_CENTS = BRANDING.cardAppFeeCents;
const CARD_APP_FEE_MEMBER_CENTS = BRANDING.cardAppFeeMemberCents;
const PRIORITY_PASS_FEE_CENTS = 500; // $5 VIP-for-a-day pass, fixed server-side
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
    const preAuthAmount = 500;

    const intent = await stripe.paymentIntents.create({
      amount: preAuthAmount,
      currency: "usd",
      capture_method: "manual",
      metadata: {
        uid: request.auth ? request.auth.uid : "guest",
      },
    });

    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  }
);

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
    const { rideId, meterFare, tipAmount, paymentMethodId } = request.data;

    if (!rideId || typeof meterFare !== "number" || meterFare <= 0) {
      throw new HttpsError("invalid-argument", "rideId and meterFare are required.");
    }
    const tip = typeof tipAmount === "number" && tipAmount >= 0 ? tipAmount : 0;

    const rideRef = db.collection("rides").doc(rideId);
    const rideSnap = await rideRef.get();
    if (!rideSnap.exists) {
      throw new HttpsError("not-found", "Ride not found.");
    }
    const ride = rideSnap.data();

    const requesterIsRider = request.auth && request.auth.uid === ride.customerId;
    const requesterIsAdmin = isAdmin(request);
    if (!requesterIsRider && !requesterIsAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only the rider on this trip or a dispatcher can settle this fare."
      );
    }

    // Mandatory fare floor: out-of-area trips are never captured for less
    // than the posted minimum, no matter what was entered.
    let effectiveMeterFare = meterFare;
    if (ride.outOfArea && Math.round(meterFare * 100) < OUT_OF_AREA_MINIMUM_FARE_CENTS) {
      effectiveMeterFare = OUT_OF_AREA_MINIMUM_FARE_CENTS / 100;
    }

    // Member discount: a real signed-in account holder pays $1.80 instead
    // of $2.00 on the card fee - guests and dispatcher overrides pay full price.
    const cardFeeCents = requesterIsRider ? CARD_APP_FEE_MEMBER_CENTS : CARD_APP_FEE_CENTS;
    const memberDiscountApplied = requesterIsRider;
    const priorityPassCents = ride.wantsPriorityPass ? PRIORITY_PASS_FEE_CENTS : 0;

    const totalCents =
      Math.round(effectiveMeterFare * 100) + Math.round(tip * 100) + cardFeeCents + priorityPassCents;

    const stripe = getStripe();
    let stripeStatus = "manual_override";

    if (ride.paymentMethod === "card") {
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
        });
        stripeStatus = intent.status;
      } else if (ride.paymentIntentId) {
        // Original pre-auth hold path (kept for compatibility).
        await stripe.paymentIntents.update(ride.paymentIntentId, {
          amount: totalCents,
        });
        const captured = await stripe.paymentIntents.capture(ride.paymentIntentId);
        stripeStatus = captured.status;
      }
    }

    await rideRef.update({
      finalFare: effectiveMeterFare,
      tipAmount: tip,
      capturedAmountCents: totalCents,
      stripeStatus,
      cardFeeCents,
      memberDiscountApplied,
      settledBy: requesterIsAdmin && !requesterIsRider ? "dispatcher_override" : "customer",
    });

    return { success: true, status: stripeStatus, memberDiscountApplied };
  }
);

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

exports.declineRide = onCall(async (request) => {
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

// Driver accounts, auto-dispatch, lease ledger (see drivers.js etc.).
Object.assign(exports, require("./drivers"));
Object.assign(exports, require("./zones"));
Object.assign(exports, require("./board"));
