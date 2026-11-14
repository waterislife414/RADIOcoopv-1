import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where, orderBy, limit, updateDoc } from "firebase/firestore";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { FARE_CONFIG, STRIPE_PUBLISHABLE_KEY } from "../config/constants";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const STATUS_LABELS = {
  pending: { label: "Request received", detail: "Waiting for a dispatcher to accept your ride.", pct: 20 },
  dispatched: { label: "Driver dispatched!", detail: "A driver has been assigned to your ride.", pct: 55 },
  in_transit: { label: "Driver is on the way!", detail: "Your ride is en route.", pct: 85 },
};

const TIP_PRESETS = [15, 20, 25];

function SettleFareForm({ ride, rideId }) {
  const stripe = useStripe();
  const elements = useElements();

  const [meterFare, setMeterFare] = useState("");
  const [tipPercent, setTipPercent] = useState(20);
  const [customTip, setCustomTip] = useState("");
  const [useCustomTip, setUseCustomTip] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const meterNum = parseFloat(meterFare) || 0;
  const tipAmount = useCustomTip
    ? parseFloat(customTip) || 0
    : meterNum * (tipPercent / 100);
  const cardFee = FARE_CONFIG.CARD_APP_FEE_MEMBER; // self-checkout is member-only
  const priorityPassFee = ride.wantsPriorityPass && !ride.fastPassId ? 5 : 0;
  const total = meterNum + tipAmount + cardFee + priorityPassFee;

  async function handlePay(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (meterNum <= 0) {
      setError("Enter the fare shown on the meter.");
      return;
    }
    setProcessing(true);
    setError("");

    try {
      const cardElement = elements.getElement(CardElement);
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
      });
      if (pmError) {
        setError(pmError.message);
        setProcessing(false);
        return;
      }

      const capture = httpsCallable(functions, "captureFare");
      await capture({
        rideId,
        meterFare: meterNum,
        tipAmount: Math.round(tipAmount * 100) / 100,
        paymentMethodId: paymentMethod.id,
      });
    } catch (err) {
      setError("Payment failed. Please try again or ask your driver for help.");
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-3.5">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Meter Fare
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={meterFare}
          onChange={(e) => setMeterFare(e.target.value)}
          className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tip</label>
        <div className="flex gap-2">
          {TIP_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => {
                setTipPercent(pct);
                setUseCustomTip(false);
              }}
              className={`flex-1 py-2.5 rounded-full text-sm font-bold transition ${
                !useCustomTip && tipPercent === pct
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {pct}%
            </button>
          ))}
          <button
            type="button"
            onClick={() => setUseCustomTip(true)}
            className={`flex-1 py-2.5 rounded-full text-sm font-bold transition ${
              useCustomTip ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Custom
          </button>
        </div>
        {useCustomTip && (
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Tip amount"
            value={customTip}
            onChange={(e) => setCustomTip(e.target.value)}
            className="w-full mt-2 border-2 border-slate-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        )}
      </div>

      <div className="border-2 border-slate-300 rounded-xl px-4 py-3.5">
        <CardElement options={{ style: { base: { fontSize: "16px", color: "#1e293b" } } }} />
      </div>

      <div className="flex justify-between text-sm text-slate-500 pt-1">
        <span>
          Meter + tip + ${cardFee.toFixed(2)} member card fee
          {priorityPassFee > 0 && ` + $${priorityPassFee.toFixed(2)} VIP pass`}
        </span>
        <span className="font-bold text-slate-800 text-lg">${total.toFixed(2)}</span>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4 rounded-full shadow-md transition disabled:opacity-50"
      >
        {processing ? "Processing..." : `Pay Now $${total.toFixed(2)}`}
      </button>
    </form>
  );
}

function RatingPrompt({ ride, rideId }) {
  const [rating, setRating] = useState(ride.rating || 0);
  const [hover, setHover] = useState(0);
  const [saved, setSaved] = useState(!!ride.rating);

  async function submitRating(stars) {
    setRating(stars);
    try {
      await updateDoc(doc(db, "rides", rideId), { rating: stars });
      setSaved(true);
    } catch (err) {
      // Non-critical - just let them try tapping again
    }
  }

  if (saved) {
    return (
      <p className="text-sm text-slate-500 mt-3">
        Thanks for rating your ride {rating} star{rating === 1 ? "" : "s"}!
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-sm text-slate-600 mb-1.5">How was your ride?</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => submitRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="text-3xl leading-none px-0.5"
            aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
          >
            {(hover || rating) >= n ? "\u2605" : "\u2606"}
          </button>
        ))}
      </div>
    </div>
  );
}

function CurrentRideStatusInner() {
  const { currentUser } = useAuth();
  const [ride, setRide] = useState(null);
  const [rideId, setRideId] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "rides"),
      where("customerId", "==", currentUser.uid),
      where("status", "in", ["pending", "dispatched", "in_transit", "finished"]),
      orderBy("timestamp", "desc"),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setRide(null);
        setRideId(null);
      } else {
        const docSnap = snap.docs[0];
        setRide(docSnap.data());
        setRideId(docSnap.id);
      }
    });
    return unsub;
  }, [currentUser]);

  if (!currentUser || !ride) return null;

  const isPaid = ride.finalFare != null;
  const info = STATUS_LABELS[ride.status] || STATUS_LABELS.pending;

  return (
    <div className="border-2 border-blue-200 bg-blue-50 rounded-2xl p-5 mb-6 text-left">
      <p className="text-xs font-bold tracking-widest text-blue-600 uppercase mb-2">
        Current Ride
      </p>

      {!isPaid && (
        <>
          <div className="w-full bg-white rounded-full h-2.5 mb-3 overflow-hidden">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${info.pct}%` }}
            />
          </div>
          <p className="font-bold text-lg text-slate-800">{info.label}</p>
          <p className="text-sm text-slate-600 mt-0.5 mb-1">{info.detail}</p>
        </>
      )}

      {isPaid && (
        <div className="text-center py-2">
          <p className="font-bold text-lg text-emerald-700">Fare Settled &mdash; Thank You!</p>
          <p className="text-sm text-slate-500 mt-1">${ride.finalFare.toFixed(2)} total, ride wrapping up.</p>
          {ride.memberDiscountApplied && (
            <p className="text-sm font-semibold text-gold-600 mt-2">
              Congratulations! You saved another 10% on transaction fees for
              being a member. Thanks for your support!
            </p>
          )}
          <RatingPrompt ride={ride} rideId={rideId} />
        </div>
      )}

      {ride.status === "in_transit" && !isPaid && (
        <div className="mt-4 pt-4 border-t border-blue-200">
          <p className="text-base font-bold text-slate-800 mb-3">Settle Your Fare</p>
          <SettleFareForm ride={ride} rideId={rideId} />
        </div>
      )}
    </div>
  );
}

export default function CurrentRideStatus() {
  return (
    <Elements stripe={stripePromise}>
      <CurrentRideStatusInner />
    </Elements>
  );
}
