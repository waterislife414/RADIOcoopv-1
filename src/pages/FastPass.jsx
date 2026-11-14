import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { useRide } from "../context/RideContext";
import BrandHeader from "../components/BrandHeader";
import { STRIPE_PUBLISHABLE_KEY } from "../config/constants";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
const payFastPass = httpsCallable(functions, "payFastPass");
const confirmFastPass = httpsCallable(functions, "confirmFastPass");

function PayForm({ onPaid }) {
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
        {busy ? "Processing…" : "Pay $5.00 Fast Pass"}
      </button>
    </div>
  );
}

/** Step between trip details and checkout: the $5 Fast Pass is paid on its own. */
export default function FastPass() {
  const { ride, updateRide } = useRide();
  const navigate = useNavigate();

  if (!ride.consent) return <Navigate to="/trip-details" replace />;
  if (!ride.wantsPriorityPass || ride.fastPassId) return <Navigate to="/payment" replace />;

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Step 1 of 2 · Fast Pass" />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <div className="rounded-3xl bg-navy-950 text-white p-6 text-center shadow-luxury mb-6">
            <p className="text-xs font-bold tracking-[0.3em] text-gold-400 uppercase">VIP for a Day</p>
            <p className="font-display text-3xl font-bold mt-1">&#9733; Fast Pass</p>
            <p className="text-slate-300 mt-2">Moves you up the dispatcher&rsquo;s queue for this ride.</p>
            <p className="font-mono text-4xl font-bold text-gold-300 mt-4">$5.00</p>
            <p className="text-xs text-slate-500 mt-1">Paid now, separate from your ride. Your ride is paid next.</p>
          </div>

          <Elements stripe={stripePromise}>
            <PayForm
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
            No thanks &mdash; skip the Fast Pass
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">Premium members are always dispatched first.</p>
        </div>
      </div>
    </div>
  );
}
