import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { BRAND, FARE_CONFIG } from "../../config/constants";
import { priceMiles, dollars } from "../../../functions/lib/fareEstimate.mjs";

const captureFare = httpsCallable(functions, "captureFare");
// The rider's tip choices (owner's Nov 16 tip screen: big and bold, "No tip" in small print).
const TIPS = [5, 10, 15];

/**
 * Drop-off on a card ride, two steps on the driver's phone:
 *  1. Driver types what the meter says.
 *  2. Rider sees their fare (Price Lock and ride credit already taken off) and taps one
 *     button: a tip choice or "No tip". That one tap pays. If the rider already left,
 *     the driver charges the fare with no tip and the rider can tip later in the app.
 */
export default function MeterCharge({ rideId, estMiles, passengers = 1, appMeterCents = null, onDone, onCancel }) {
  const [meter, setMeter] = useState("");
  const [quote, setQuote] = useState(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const est = priceMiles({ miles: Number(estMiles), fare: FARE_CONFIG, passengers, cfg: BRAND.pricing?.estimate || {} });
  const value = parseFloat(meter);
  const meterFare = Math.round(value * 100) / 100;

  const fail = (e) => {
    setError((e?.code !== "functions/internal" && e?.message) || "The card didn't go through.");
    setBusy(false);
  };

  async function showRider() {
    setBusy(true);
    setError("");
    try {
      const { data } = await captureFare({ rideId, meterFare, preview: true, appMeterCents });
      setQuote(data);
      setBusy(false);
    } catch (e) {
      fail(e);
    }
  }

  async function pay(tipCents, riderApproved = true) {
    setBusy(true);
    setError("");
    try {
      await captureFare({ rideId, meterFare, tipAmount: tipCents / 100, riderApproved, appMeterCents });
      onDone({ charged: true });
    } catch (e) {
      fail(e);
    }
  }

  const tipOf = (pct) => Math.round((quote.meterCents * pct) / 100);
  const otherCents = Math.round((parseFloat(other) || 0) * 100);

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Card payment">
      {!quote ? (
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
          {appMeterCents > 0 && (
            <button
              type="button"
              data-testid="use-app-meter"
              onClick={() => setMeter((appMeterCents / 100).toFixed(2))}
              className="w-full rounded-full border-2 border-gold-400 text-gold-200 font-bold py-2"
            >
              App measured about {dollars(appMeterCents)}: tap to use it
            </button>
          )}
          {est && <p className="text-sm text-slate-300">Trip estimate: about {dollars(est.fareCents)}. Type what your meter says.</p>}
          {error && <p className="rounded-xl bg-red-500/20 text-red-200 p-3 text-sm font-semibold">{error}</p>}
          <button
            type="button"
            data-testid="meter-charge-btn"
            disabled={!(value > 0) || busy}
            onClick={showRider}
            className="w-full min-h-[60px] rounded-full bg-gold-400 text-navy-950 font-extrabold text-xl disabled:opacity-50"
          >
            {busy ? "One moment…" : value > 0 ? "Show the rider" : "Enter the meter"}
          </button>
          <p className="text-xs text-slate-400">
            Card fares go on your lick credit, less the card company&rsquo;s cut (2.9% + 30&cent;). Tips are 100% yours.
          </p>
          {error ? (
            <button type="button" onClick={() => onDone({ charged: false })} className="w-full min-h-[48px] rounded-full border-2 border-white/40 font-bold">
              Drop off without charging (office settles it)
            </button>
          ) : (
            <button type="button" onClick={onCancel} className="w-full min-h-[48px] rounded-full border-2 border-white/30 font-bold text-slate-200">
              Back
            </button>
          )}
        </div>
      ) : (
        <div className="w-full max-w-sm rounded-3xl bg-white text-slate-900 p-6 space-y-3" data-testid="rider-pay">
          <p className="text-sm font-bold uppercase tracking-wider text-slate-500">Your fare</p>
          <div className="space-y-1 text-lg">
            <p className="flex justify-between"><span>Meter</span><span>{dollars(quote.meterCents)}</span></p>
            {quote.lockOffCents > 0 && (
              <p className="flex justify-between text-emerald-700 font-semibold"><span>{"\u{1F512}"} Price Lock</span><span>&minus;{dollars(quote.lockOffCents)}</span></p>
            )}
            {quote.creditUsedCents > 0 && (
              <p className="flex justify-between text-emerald-700 font-semibold"><span>Ride credit</span><span>&minus;{dollars(quote.creditUsedCents)}</span></p>
            )}
            {quote.priorityPassCents > 0 && (
              <p className="flex justify-between"><span>Priority Day Pass</span><span>{dollars(quote.priorityPassCents)}</span></p>
            )}
            <p className="flex justify-between text-2xl font-extrabold border-t border-slate-200 pt-1" data-testid="rider-pay-total">
              <span>You pay</span><span>{dollars(quote.totalCents)}</span>
            </p>
          </div>
          {quote.overEstimate && (
            <p className="rounded-xl bg-amber-50 text-amber-900 p-3 text-sm font-semibold" data-testid="over-estimate">
              This is more than the trip estimate ({dollars(quote.estFareCents)}). Pay only if it looks right.
            </p>
          )}
          {quote.tripChanged && <p className="text-sm text-slate-500">The trip changed on the way, so the meter sets the fare.</p>}
          <p className="font-bold text-lg pt-1">Add a tip for your driver?</p>
          <div className="grid grid-cols-3 gap-2">
            {TIPS.map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={busy}
                onClick={() => pay(tipOf(pct))}
                className="min-h-[72px] rounded-2xl bg-blue-600 text-white font-extrabold text-2xl disabled:opacity-60"
              >
                {pct}%
                <span className="block text-xs font-semibold">Pay {dollars(quote.totalCents + tipOf(pct))}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Other tip $"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className="flex-1 border-2 border-slate-300 rounded-full px-4 py-2.5 text-base"
            />
            <button
              type="button"
              disabled={busy || !(otherCents > 0)}
              onClick={() => pay(otherCents)}
              className="rounded-full bg-slate-800 text-white font-bold px-4 disabled:opacity-40"
            >
              Pay {otherCents > 0 ? dollars(quote.totalCents + otherCents) : ""}
            </button>
          </div>
          <button type="button" data-testid="pay-no-tip" disabled={busy} onClick={() => pay(0)} className="block w-full text-center text-sm text-slate-500 underline py-1">
            No tip &mdash; pay {dollars(quote.totalCents)}
          </button>
          {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm font-semibold">{error}</p>}
          <div className="border-t border-slate-200 pt-2 flex flex-col gap-1">
            <button type="button" data-testid="rider-left" disabled={busy} onClick={() => pay(0, false)} className="text-sm font-semibold text-slate-700 underline">
              Driver: rider already left? Charge {dollars(quote.totalCents)} with no tip
            </button>
            {error ? (
              <button type="button" onClick={() => onDone({ charged: false })} className="text-sm font-semibold text-slate-700 underline">
                Drop off without charging (office settles it)
              </button>
            ) : (
              <button type="button" onClick={() => setQuote(null)} className="text-sm text-slate-500 underline">
                Back to the meter
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
