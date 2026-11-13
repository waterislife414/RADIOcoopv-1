import { useState } from "react";
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

export default function CardPaymentForm({ onAuthorized, submitting }) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholderName, setCardholderName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [cardError, setCardError] = useState("");

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
      <p className="text-xs text-slate-400">
        This places a hold only. You are not charged until dispatch confirms your final fare.
      </p>
    </div>
  );
}
