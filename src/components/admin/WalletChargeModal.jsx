import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";

// Step 1: dispatcher enters the amount called in.
// Step 2: a hard confirmation screen - the dollar amount in huge bold text,
// with big YES and big NO buttons, clearly separated so a mis-tap can't
// accidentally charge the wrong amount to a customer's account.
export default function WalletChargeModal({ ride, onClose, onCharged }) {
  const [step, setStep] = useState(1);
  const [amountInput, setAmountInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const amount = parseFloat(amountInput) || 0;

  function goToConfirm(e) {
    e.preventDefault();
    if (amount <= 0) {
      setError("Enter an amount greater than $0.");
      return;
    }
    setError("");
    setStep(2);
  }

  async function handleConfirm() {
    setProcessing(true);
    setError("");
    try {
      const chargeWallet = httpsCallable(functions, "chargeWallet");
      await chargeWallet({ rideId: ride.id, amount });
      onCharged();
    } catch (err) {
      setError(err.message || "Could not charge wallet balance.");
      setProcessing(false);
      setStep(1);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs">
        {step === 1 && (
          <form onSubmit={goToConfirm}>
            <h3 className="font-bold text-slate-800 text-lg mb-1">Charge Customer Wallet</h3>
            <p className="text-sm text-slate-500 mb-4">
              {ride.guestFirstName} {ride.guestLastName} &mdash; enter the total called in.
            </p>
            <input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              placeholder="Amount ($)"
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 mb-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-3">{error}</div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl"
              >
                Next
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div>
            <p className="text-center text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Confirm Wallet Charge
            </p>
            <p className="text-center text-5xl font-black text-slate-900 mb-2 tabular-nums">
              ${amount.toFixed(2)}
            </p>
            <p className="text-center text-base text-slate-600 mb-6">
              Charge this to {ride.guestFirstName} {ride.guestLastName}'s
              Radio Co-op account balance?
            </p>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleConfirm}
                disabled={processing}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xl py-5 rounded-2xl disabled:opacity-50"
              >
                {processing ? "Charging..." : "YES, CHARGE IT"}
              </button>
              <button
                onClick={() => setStep(1)}
                disabled={processing}
                className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-xl py-5 rounded-2xl disabled:opacity-50"
              >
                NO, GO BACK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
