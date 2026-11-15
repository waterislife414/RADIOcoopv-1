import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { useRide } from "../context/RideContext";
import BrandHeader from "../components/BrandHeader";
import { BRAND, COMPANY_PHONE_DISPLAY, STRIPE_PUBLISHABLE_KEY } from "../config/constants";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
const payFastPass = httpsCallable(functions, "payFastPass");
const confirmFastPass = httpsCallable(functions, "confirmFastPass");

function PayForm({ onPaid, label }) {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pay() {
    if (!stripe || !elements) return;
    if (!name.trim()) return setErr("Cardholder name is required.");
    setBusy(true);
    setErr("");
    try {
      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: "card",
        card: elements.getElement(CardElement),
        billing_details: { name: name.trim() },
      });
      if (error) throw new Error(error.message);
      let { data } = await payFastPass({ paymentMethodId: paymentMethod.id });
      if (data.status === "requires_action" && data.clientSecret) {
        const extra = await stripe.confirmCardPayment(data.clientSecret);
        if (extra.error) throw new Error(extra.error.message);
        ({ data } = await confirmFastPass({ id: data.id }));
      }
      if (data.status !== "succeeded") throw new Error("Your card was declined.");
      onPaid(data.id);
    } catch (e) {
      setErr(e?.message || "Payment failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Cardholder Name"
        className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="border-2 border-slate-300 rounded-xl px-4 py-3.5">
        <CardElement options={{ style: { base: { fontSize: "16px", color: "#1e293b" } } }} />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        type="button"
        onClick={pay}
        disabled={busy || !stripe}
        className="w-full bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-extrabold text-lg py-4 rounded-2xl shadow-luxury disabled:opacity-50"
      >
        {busy ? "Processing…" : label}
      </button>
    </div>
  );
}

const applyDayPass = httpsCallable(functions, "applyDayPass");
const queueStatus = httpsCallable(functions, "queueStatus");
const PASS = BRAND.copy.dayPass;

function PassCard() {
  const { currentUser } = useAuth();
  return (
    <div className="rounded-3xl bg-navy-950 text-white p-6 text-center shadow-luxury mb-6">
      <p className="text-xs font-bold tracking-[0.3em] text-gold-400 uppercase">&#9733; {PASS.title}</p>
      <p className="font-display text-2xl font-bold mt-1">{PASS.tagline}</p>
      <ul className="text-left space-y-1.5 text-slate-200 mt-4">
        {(currentUser ? PASS.perks : PASS.perks.slice(0, 1)).map((p) => (
          <li key={p} className="flex gap-2">
            <span className="text-gold-400" aria-hidden="true">
              &#10003;
            </span>
            {p}
          </li>
        ))}
      </ul>
      <p className="font-mono text-4xl font-bold text-gold-300 mt-4">{PASS.price}</p>
      <p className="text-xs text-slate-400 mt-1">{currentUser ? PASS.fine : "For this ride. Premium members still go first."}</p>
      {!currentUser && (
        <p className="text-sm text-gold-200 mt-3 font-semibold">As a guest, the pass moves this ride up the line. The map and calling need a free account.</p>
      )}
    </div>
  );
}

/**
 * The $5 Priority Day Pass, paid on its own. Two ways in: a step between trip
 * details and checkout, or ?ride=ID for a ride that's already waiting (it
 * moves up the line; a ride already dispatched gets the map and calling).
 */
export default function FastPass() {
  const { ride, updateRide } = useRide();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const waitingRideId = params.get("ride");
  const [err, setErr] = useState("");
  const [stillWaiting, setStillWaiting] = useState(true);
  const back = currentUser ? "/" : "/success";
  // Don't sell a pass for a ride a driver already took.
  useEffect(() => {
    if (!waitingRideId) return undefined;
    let stop = false;
    const check = () =>
      queueStatus({ rideId: waitingRideId })
        .then(({ data }) => !stop && setStillWaiting(!!data?.waiting || (!!currentUser && data?.status === "dispatched")))
        .catch(() => {});
    check();
    const t = setInterval(check, 10000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [waitingRideId, currentUser]);
  // Saying no here counts as seeing the offer (it shows twice at most).
  function declineAndGoBack() {
    try {
      const key = `rc-line-offer-${waitingRideId}`;
      const seen = JSON.parse(sessionStorage.getItem(key) || "{}");
      sessionStorage.setItem(key, JSON.stringify({ count: (seen.count || 0) + 1, at: Date.now() }));
    } catch {
      // Private mode: harmless.
    }
    navigate(back);
  }

  if (waitingRideId) {
    return (
      <div className="min-h-screen bg-white">
        <BrandHeader tagline={PASS.title} />
        <div className="px-6 py-8">
          <div className="max-w-md mx-auto">
            <PassCard />
            {!stillWaiting && (
              <p className="rounded-xl bg-emerald-50 border-2 border-emerald-300 p-3 font-semibold text-emerald-900 mb-3">
                A driver already has your ride, so you don&rsquo;t need this now.
              </p>
            )}
            {stillWaiting && (
            <Elements stripe={stripePromise}>
              <PayForm
                label={`Pay ${PASS.price} and skip ahead`}
                onPaid={async (id) => {
                  try {
                    await applyDayPass({ rideId: waitingRideId, passId: id });
                    navigate(back, { replace: true });
                  } catch (e) {
                    setErr(
                      currentUser
                        ? `Paid. ${e?.message || "It couldn't be added to this ride."} Your pass still works on your other rides today.`
                        : `Paid, but ${e?.message || "it couldn't be added to this ride"}. Call us at ${COMPANY_PHONE_DISPLAY} and we'll refund your ${PASS.price}.`
                    );
                    setTimeout(() => navigate(back, { replace: true }), 4000);
                  }
                }}
              />
            </Elements>
            )}
            {err && <p className="text-sm text-red-700 mt-3">{err}</p>}
            <button type="button" onClick={declineAndGoBack} className="w-full mt-4 min-h-[48px] text-slate-500 font-semibold py-3">
              No thanks, I&rsquo;ll wait
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!ride.consent) return <Navigate to="/trip-details" replace />;
  if (!ride.wantsPriorityPass || ride.fastPassId) return <Navigate to="/payment" replace />;

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline={`Step 1 of 2 \u00b7 ${PASS.title}`} />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <PassCard />
          <p className="text-xs text-slate-500 text-center -mt-3 mb-4">Paid now, separate from your ride. Your ride is paid next.</p>
          <Elements stripe={stripePromise}>
            <PayForm
              label={`Pay ${PASS.price} ${PASS.title}`}
              onPaid={(id) => {
                updateRide({ fastPassId: id });
                navigate("/payment");
              }}
            />
          </Elements>

          <button
            type="button"
            onClick={() => {
              updateRide({ wantsPriorityPass: false });
              navigate("/payment");
            }}
            className="w-full mt-4 text-slate-500 font-semibold py-3"
          >
            No thanks &mdash; skip the {PASS.title}
          </button>
        </div>
      </div>
    </div>
  );
}
