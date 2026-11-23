import { useEffect, useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

const cardElementOptions = {
  style: {
    base: {
      fontSize: "16px",
      color: "#1e293b",
      "::placeholder": { color: "#94a3b8" },
    },
  },
};

const mySavedCard = httpsCallable(functions, "mySavedCard");
const brandName = (b) => ({ visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover" })[b] || "card";

export default function CardPaymentForm({ onAuthorized, submitting, allowSaved = false }) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholderName, setCardholderName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [cardError, setCardError] = useState("");
  // Members: the card they used before, one tap (brand + last 4 only).
  const [saved, setSaved] = useState(null);
  const [typeNew, setTypeNew] = useState(false);
  useEffect(() => {
    if (!allowSaved) return undefined;
    let live = true;
    mySavedCard()
      .then(({ data }) => live && setSaved(data || null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [allowSaved]);

  async function paySaved() {
    if (!stripe) return;
    setProcessing(true);
    setCardError("");
    try {
      const { data } = await httpsCallable(functions, "createPaymentIntent")({ useSaved: true });
      // Confirms with the saved card; the bank may ask the rider to approve (handled here).
      const result = await stripe.confirmCardPayment(data.clientSecret);
      if (result.error) {
        setCardError(result.error.message);
        setProcessing(false);
        return;
      }
      onAuthorized(result.paymentIntent.id, "");
    } catch (err) {
      setCardError(err?.message || "That card didn't work. Type a card instead.");
      setTypeNew(true);
      setProcessing(false);
    }
  }

  if (saved && !typeNew) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          data-testid="pay-saved-card"
          onClick={paySaved}
          disabled={!stripe || processing || submitting}
          className="w-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl transition disabled:opacity-50"
        >
          {processing ? "Booking\u2026" : `Book with ${brandName(saved.brand)} \u2022\u2022${saved.last4}`}
        </button>
        {cardError && <p className="text-sm text-red-600">{cardError}</p>}
        <button type="button" onClick={() => setTypeNew(true)} className="text-sm font-semibold text-blue-700 underline">
          Use a different card
        </button>
        <p className="text-xs text-slate-500">A small hold checks the card. You pay the fare at drop-off.</p>
      </div>
    );
  }

  async function handleAuthorize() {
    if (!stripe || !elements) return;
    if (!cardholderName.trim()) {
      setCardError("Cardholder name is required.");
      return;
    }
    setProcessing(true);
    setCardError("");

    try {
      const createIntent = httpsCallable(functions, "createPaymentIntent");
      const { data } = await createIntent({});
      const clientSecret = data.clientSecret;

      const cardElement = elements.getElement(CardElement);

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { name: cardholderName.trim() },
        },
      });

      if (result.error) {
        setCardError(result.error.message);
        setProcessing(false);
        return;
      }

      onAuthorized(result.paymentIntent.id, cardholderName.trim());
    } catch (err) {
      setCardError("Card authorization failed. Please try again.");
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Cardholder Name"
        className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600"
        value={cardholderName}
        onChange={(e) => setCardholderName(e.target.value)}
      />
      <div className="border border-slate-300 rounded-xl px-4 py-3">
        <CardElement options={cardElementOptions} />
      </div>
      {cardError && <p className="text-xs text-red-600">{cardError}</p>}
      <button
        onClick={handleAuthorize}
        disabled={!stripe || processing || submitting}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
      >
        {processing ? "Authorizing..." : "Authorize Card"}
      </button>
      <p className="text-xs text-slate-500">
        A small hold checks the card. You pay the fare at drop-off.
      </p>
    </div>
  );
}
