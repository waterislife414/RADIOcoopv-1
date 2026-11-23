import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { BRAND, FARE_CONFIG } from "../../config/constants";
import { priceMiles, dollars } from "../../../functions/lib/fareEstimate.mjs";
import { cardFeeRule } from "../../../functions/lib/cardFee.mjs";

const captureFare = httpsCallable(functions, "captureFare");

/**
 * Drop-off on a card ride: the driver types what the meter says and the card
 * the rider booked with is charged. One number, one button. The rider gets the
 * receipt (and can add a tip) on their phone.
 */
export default function MeterCharge({ rideId, estMiles, passengers = 1, onDone, onCancel }) {
  const [meter, setMeter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const est = priceMiles({ miles: Number(estMiles), fare: FARE_CONFIG, passengers, cfg: BRAND.pricing?.estimate || {} });
  const value = parseFloat(meter);
  const ok = value > 0;

  async function charge() {
    setBusy(true);
    setError("");
    try {
      await captureFare({ rideId, meterFare: Math.round(value * 100) / 100 });
      onDone({ charged: true });
    } catch (e) {
      setError((e?.code !== "functions/internal" && e?.message) || "The card didn't go through.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Enter the meter">
      <div className="w-full max-w-sm rounded-3xl bg-navy-950 text-white p-6 space-y-4" data-testid="meter-charge">
        <p className="text-2xl font-display font-bold">What does the meter say?</p>
        <label className="flex items-center gap-2 rounded-2xl bg-white text-slate-900 px-4">
          <span className="text-3xl font-bold">$</span>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={meter}
            onChange={(e) => setMeter(e.target.value)}
            data-testid="meter-input"
            className="w-full py-4 text-4xl font-bold bg-transparent outline-none"
          />
        </label>
        {est && <p className="text-sm text-slate-300">Trip estimate: about {dollars(est.fareCents)}.</p>}
        <p className="text-sm text-slate-300">The rider&rsquo;s card is charged. {cardFeeRule(BRAND.pricing?.cardFee)} The rider can add a tip on their phone.</p>
        {error && <p className="rounded-xl bg-red-500/20 text-red-200 p-3 text-sm font-semibold">{error}</p>}
        <button
          type="button"
          data-testid="meter-charge-btn"
          disabled={!ok || busy}
          onClick={charge}
          className="w-full min-h-[60px] rounded-full bg-gold-400 text-navy-950 font-extrabold text-xl disabled:opacity-50"
        >
          {busy ? "Charging…" : ok ? `Charge card $${value.toFixed(2)}` : "Enter the meter"}
        </button>
        {error ? (
          <button
            type="button"
            onClick={() => onDone({ charged: false })}
            className="w-full min-h-[48px] rounded-full border-2 border-white/40 font-bold"
          >
            Drop off without charging (office settles it)
          </button>
        ) : (
          <button type="button" onClick={onCancel} className="w-full min-h-[48px] rounded-full border-2 border-white/30 font-bold text-slate-200">
            Back
          </button>
        )}
      </div>
    </div>
  );
}
