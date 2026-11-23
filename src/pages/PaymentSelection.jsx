import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { submitRide as saveRide } from "../lib/submitRide";
import { useAuth } from "../context/AuthContext";
import { useRide } from "../context/RideContext";
import CardPaymentForm from "../components/CardPaymentForm";
import BrandHeader from "../components/BrandHeader";
import { BRAND, PROMO_CODES, STRIPE_PUBLISHABLE_KEY } from "../config/constants";
import { estimateFromMiles } from "../lib/tripEstimate";
import { cardFeeRule } from "../../functions/lib/cardFee.mjs";
import { memberDealsFor } from "../lib/memberDeals";
import { dollars } from "../../functions/lib/fareEstimate.mjs";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

export default function PaymentSelection() {
  const { currentUser, userProfile } = useAuth();
  const { ride, updateRide } = useRide();
  const navigate = useNavigate();

  const [promoInput, setPromoInput] = useState(ride.promoCode);
  const [promoStatus, setPromoStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // The price the rider saw on the booking screen, now per way of paying.
  const est = estimateFromMiles(ride.estMiles, ride, { signedIn: !!currentUser });
  const feeRule = cardFeeRule(BRAND.pricing?.cardFee);
  const deals = currentUser ? memberDealsFor(userProfile) : null;
  const lockCents = deals?.priceLock && est && !ride.stops?.length ? est.highCents : null;
  // Card total after ride credit (the server takes it off when the card is charged).
  const cardTotal = est ? Math.max(0, est.totalCents - (deals?.creditCents || 0)) : null;

  function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (code === PROMO_CODES.FIRST_RIDE) {
      updateRide({ promoCode: code });
      setPromoStatus("Promo applied: first ride discount.");
    } else if (code) {
      setPromoStatus("Invalid promo code.");
    }
  }

  async function submitRide(paymentMethod, paymentIntentId = null, cardholderName = null) {
    setSubmitting(true);
    setError("");
    try {
      const id = await saveRide(ride, { uid: currentUser?.uid || null, paymentMethod, paymentIntentId, cardholderName });
      updateRide({ lastRideId: id });
      navigate("/success");
    } catch (err) {
      setError(
        err?.code === "permission-denied"
          ? "This phone number is currently unable to book rides. Please call the office directly."
          : "Could not submit your request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function selectSimplePayment(method) {
    updateRide({ paymentMethod: method });
    if (method === "cash" && ride.wantsPriorityPass) {
      return;
    }
    submitRide(method);
  }


  // No booking without the agreed terms (covers someone opening this page directly).
  if (!ride.consent && !submitting) return <Navigate to="/trip-details" replace />;
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-4">
            How will you pay?
          </h1>
          <div data-testid="trip-summary" className="rounded-2xl bg-slate-50 border-2 border-slate-200 px-4 py-3 mb-5">
            <p className="text-sm text-slate-600 truncate">
              {ride.pickup || (typeof ride.pickupLat === "number" ? "Your location" : "")} &rarr; {ride.dropoff}
            </p>
            {est ? (
              <p className="text-base text-slate-800">
                About <b data-testid="summary-fare">{dollars(est.fareCents)}</b> on the meter &middot; {est.miles} mi
              </p>
            ) : (
              <p className="text-base text-slate-800">Fare set by the meter.</p>
            )}
          </div>
          {ride.wantsPriorityPass && ride.fastPassId && (
            <div className="bg-emerald-50 border-2 border-emerald-500 text-emerald-800 rounded-2xl px-4 py-3 mb-5 font-semibold">
              &#10003; Priority Day Pass is on for this ride. Now choose how you&rsquo;ll pay for the ride.
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-3.5 mb-6">
            <button
              onClick={() => selectSimplePayment("cash")}
              disabled={submitting}
              className="w-full text-left border-2 border-slate-300 hover:border-blue-600 rounded-2xl px-5 py-5 flex justify-between items-center transition"
            >
              <span>
                <span className="block font-bold text-lg text-slate-800">Cash</span>
                <span className="block text-slate-500 text-sm">Pay your driver. No extra fee.</span>
              </span>
              {est && <span data-testid="total-cash" className="font-bold text-lg text-slate-800">{dollars(est.fareCents)}</span>}
            </button>

            <button
              onClick={() => selectSimplePayment("transfer")}
              disabled={submitting}
              className="w-full text-left border-2 border-slate-300 hover:border-blue-600 rounded-2xl px-5 py-5 flex justify-between items-center transition"
            >
              <span>
                <span className="block font-bold text-lg text-slate-800">Transfer (CashApp/Venmo)</span>
                <span className="block text-slate-500 text-sm">Pay by app. No extra fee.</span>
              </span>
              {est && <span className="font-bold text-lg text-slate-800">{dollars(est.fareCents)}</span>}
            </button>

            <div className="border-2 border-slate-300 rounded-2xl px-5 py-5">
              <div className="flex justify-between items-center mb-3">
                <span>
                  <span className="block font-bold text-lg text-slate-800">Card</span>
                  <span className="block text-slate-500 text-sm" data-testid="card-fee-rule">{feeRule}</span>
                  {lockCents != null && (
                    <span className="block text-emerald-700 text-sm font-semibold" data-testid="card-price-lock">
                      {"\u{1F512}"} Never more than {dollars(Math.max(0, lockCents - (deals?.creditCents || 0)))}
                    </span>
                  )}
                  {deals?.creditCents > 0 && (
                    <span className="block text-emerald-700 text-sm font-semibold">{dollars(deals.creditCents)} ride credit included</span>
                  )}
                  <span className="block text-slate-500 text-sm">At drop-off you tap Pay on your driver&rsquo;s phone.</span>
                </span>
                {est ? (
                  <span data-testid="total-card" className="font-bold text-lg text-slate-800 text-right">
                    {dollars(cardTotal)}
                  </span>
                ) : null}
              </div>
              <Elements stripe={stripePromise}>
                <CardPaymentForm
                  allowSaved={!!currentUser}
                  onAuthorized={(paymentIntentId, cardholderName) => {
                    updateRide({ paymentMethod: "card" });
                    submitRide("card", paymentIntentId, cardholderName);
                  }}
                  submitting={submitting}
                />
              </Elements>
            </div>
          </div>

          {ride.paymentMethod === "cash" && ride.wantsPriorityPass && (
            <div data-testid="pass-cash-warning" className="rounded-xl bg-red-50 border-2 border-red-300 text-red-800 p-3 font-semibold mb-6 flex justify-between items-center">
              <span>Priority Day Pass can&rsquo;t be paid with cash.</span>
              <button
                type="button"
                data-testid="pass-remove"
                onClick={() => updateRide({ wantsPriorityPass: false })}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold"
              >
                Remove pass
              </button>
            </div>
          )}

          {/* Hidden until a first-ride discount is actually applied at checkout. */}
          {PROMO_CODES.FIRST_RIDE_ACTIVE && (
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4">
            <label className="block text-base font-semibold text-slate-700 mb-2">
              Promo Code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="WELCOME2"
              />
              <button
                onClick={applyPromo}
                className="bg-slate-300 hover:bg-slate-400 px-4 rounded-xl text-slate-800 font-semibold"
              >
                Apply
              </button>
            </div>
            {promoStatus && <p className="text-sm text-slate-500 mt-2">{promoStatus}</p>}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
