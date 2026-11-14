import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import { SUBSCRIPTION_TIERS, SUBSCRIPTION_TRIAL_DAYS, STRIPE_PUBLISHABLE_KEY } from "../config/constants";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const cardElementOptions = {
  style: {
    base: {
      fontSize: "16px",
      color: "#1e293b",
      "::placeholder": { color: "#94a3b8" },
    },
  },
};

function BillingToggle({ billingCycle, setBillingCycle, tierInfo }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-6">
      <button
        type="button"
        onClick={() => setBillingCycle("monthly")}
        className={`rounded-xl py-3.5 px-3 border-2 text-left transition ${
          billingCycle === "monthly"
            ? "border-blue-600 bg-blue-50"
            : "border-slate-200"
        }`}
      >
        <p className="font-bold text-slate-800 text-base">Monthly</p>
        <p className="text-sm text-slate-500">${tierInfo.monthlyPrice}/mo</p>
      </button>
      <button
        type="button"
        onClick={() => setBillingCycle("annual")}
        className={`rounded-xl py-3.5 px-3 border-2 text-left transition relative ${
          billingCycle === "annual"
            ? "border-blue-600 bg-blue-50"
            : "border-slate-200"
        }`}
      >
        <span className="absolute -top-2.5 right-2 bg-gold-500 text-navy-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
          SAVE 1 MONTH
        </span>
        <p className="font-bold text-slate-800 text-base">Annual</p>
        <p className="text-sm text-slate-500">${tierInfo.annualPrice}/yr</p>
      </button>
    </div>
  );
}

function CheckoutForm({ tierKey, tierInfo, billingCycle }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();

  const [cardholderName, setCardholderName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const price = billingCycle === "annual" ? tierInfo.annualPrice : tierInfo.monthlyPrice;
  const period = billingCycle === "annual" ? "yr" : "mo";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!cardholderName.trim()) {
      setError("Cardholder name is required.");
      return;
    }
    setProcessing(true);
    setError("");

    try {
      const createSetup = httpsCallable(functions, "createSubscriptionSetupIntent");
      const { data: setupData } = await createSetup();

      const cardElement = elements.getElement(CardElement);
      const result = await stripe.confirmCardSetup(setupData.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { name: cardholderName.trim() },
        },
      });

      if (result.error) {
        setError(result.error.message);
        setProcessing(false);
        return;
      }

      const paymentMethodId = result.setupIntent.payment_method;
      const startSub = httpsCallable(functions, "startSubscription");
      await startSub({ tier: tierKey, billingCycle, paymentMethodId });

      navigate("/profile");
    } catch (err) {
      setError(
        "Payment could not be processed. Card billing isn't fully activated on this account yet — contact dispatch to enroll manually for now."
      );
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Cardholder Name"
        className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
        value={cardholderName}
        onChange={(e) => setCardholderName(e.target.value)}
      />
      <div className="border-2 border-slate-300 rounded-xl px-4 py-3.5">
        <CardElement options={cardElementOptions} />
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-bold text-lg py-4 rounded-full shadow-luxury transition hover:-translate-y-0.5 disabled:opacity-50"
      >
        {processing ? "Processing..." : `Start ${SUBSCRIPTION_TRIAL_DAYS}-Day Free Trial`}
      </button>
      <p className="text-xs text-slate-500 text-center">
        Free for {SUBSCRIPTION_TRIAL_DAYS} days, then ${price}/{period} automatically
        &mdash; cancel anytime before your trial ends and you won't be charged.
      </p>
    </form>
  );
}

const SMS_ADDON_INFO = {
  name: "SMS Ride Alerts",
  monthlyPrice: 15,
  isAddon: true,
  description: "Get texts the moment your driver is dispatched and on the way \u2014 in addition to email.",
};

export default function SubscriptionCheckout() {
  const { tier } = useParams();
  const navigate = useNavigate();
  const tierKey = (tier || "").toUpperCase();
  const tierInfo = tierKey === "SMS_ADDON" ? SMS_ADDON_INFO : SUBSCRIPTION_TIERS[tierKey];
  const [billingCycle, setBillingCycle] = useState("monthly");

  if (!tierInfo) {
    return (
      <div className="min-h-screen bg-white">
        <BrandHeader />
        <div className="px-6 py-16 text-center">
          <p className="text-slate-600 text-lg mb-6">Unknown plan.</p>
          <button
            onClick={() => navigate("/profile")}
            className="text-blue-600 font-semibold"
          >
            &larr; Back to Profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => navigate("/profile")}
            className="text-blue-600 text-sm font-semibold mb-4"
          >
            &larr; Back
          </button>
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-1">
            {tierInfo.name}
          </h1>
          <p className="text-slate-500 text-base mb-5">
            {tierInfo.isAddon
              ? tierInfo.description
              : `1 free entry every ${tierInfo.ridesForFreeEntry} rides${tierInfo.perks.freeMilePer10Rides ? " + 1 free mile" : ""}`}
          </p>

          {!tierInfo.isAddon && (
            <BillingToggle
              billingCycle={billingCycle}
              setBillingCycle={setBillingCycle}
              tierInfo={tierInfo}
            />
          )}

          <Elements stripe={stripePromise}>
            <CheckoutForm tierKey={tierKey} tierInfo={tierInfo} billingCycle={billingCycle} />
          </Elements>
        </div>
      </div>
    </div>
  );
}
