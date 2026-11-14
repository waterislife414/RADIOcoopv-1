import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { ring } from "../../utils/alertSound";
import { reasonsFor } from "../../../functions/lib/callIssues.mjs";
import { quickFix } from "../../utils/quickFix";

const pickedUp = httpsCallable(functions, "driverPickedUp");
const driverEndCall = httpsCallable(functions, "driverEndCall");

/** "Can't finish this call": pick why, write what happened, send. */
function EndCallSheet({ ride, onClose }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reasons = reasonsFor(ride.status);
  const picked = reasons.find((r) => r.id === reason);

  async function send() {
    setBusy(true);
    setErr("");
    try {
      const fix = await quickFix();
      await driverEndCall({ rideId: ride.rideId, reason, note, ...(fix || {}) });
      onClose(true);
    } catch (e) {
      setErr(e?.message || "Couldn't send. Try again or call the office.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[75] bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Can't finish this call">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-navy-900 border border-white/15 p-5 space-y-3 text-white">
        <p className="text-2xl font-display font-bold">Can&rsquo;t finish this call?</p>
        {!picked ? (
          <>
            <p className="text-slate-300">Why?</p>
            {reasons.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.id)}
                className={`w-full min-h-[52px] rounded-2xl border-2 px-4 text-left font-bold text-lg ${r.warnings ? "border-red-400/70" : "border-white/20"}`}
              >
                {r.label}
                {r.warnings > 0 && <span className="block text-sm font-semibold text-red-300">Counts as {r.warnings} warnings</span>}
              </button>
            ))}
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-gold-300">{picked.label}</p>
            {picked.warnings > 0 && (
              <p className="rounded-xl bg-red-500/20 border border-red-400 p-3 text-red-100 font-semibold">This counts as {picked.warnings} warnings on your record.</p>
            )}
            <p className="text-sm text-slate-300">
              {picked.ride === "redispatch"
                ? ride.status === "in_transit"
                  ? "The office will send another car to where you are."
                  : "The call goes to another driver."
                : picked.ride === "finish"
                  ? "The ride ends here and the office is told."
                  : "The ride is called off."}
              {picked.board === "offline" ? " You'll be taken off the board until the car is fixed." : ""}
            </p>
            <label className="block">
              <span className="block font-bold mb-1">What happened? (required)</span>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl bg-white text-navy-950 px-3 py-2 text-base" placeholder="A few words for the office" />
            </label>
            {err && <p className="text-red-300">{err}</p>}
            <button type="button" disabled={busy || note.trim().length < 3} onClick={send} className="w-full min-h-[56px] rounded-2xl bg-gold-400 text-navy-950 font-extrabold text-lg disabled:opacity-40">
              {busy ? "Sending\u2026" : "Send to the office"}
            </button>
            <button type="button" onClick={() => setReason(null)} className="w-full py-2 text-slate-300 font-semibold">
              &larr; Pick a different reason
            </button>
          </>
        )}
        <button type="button" onClick={() => onClose(false)} className="w-full py-2 text-slate-300 font-semibold">
          Keep the call
        </button>
      </div>
    </div>
  );
}

function navUrl(lat, lng, address) {
  const dest = typeof lat === "number" ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest || "")}`;
}

/** The call this driver is on: where to go, who to call, Picked Up. Drop Off is on the status card. */
export default function CurrentRide({ ride }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ending, setEnding] = useState(false);
  const rung = useRef(null);
  // Ring when dispatch hands him a call (he didn't tap Accept, so he may not be looking).
  useEffect(() => {
    if (ride?.how === "dispatcher" && rung.current !== ride.rideId && Date.now() - (ride.assignedAt || 0) < 60_000) {
      rung.current = ride.rideId;
      ring(3);
    }
  }, [ride?.rideId, ride?.how, ride?.assignedAt]);
  if (!ride) return null;
  const going = ride.status === "dispatched";

  async function markPickedUp() {
    setBusy(true);
    setMsg("");
    try {
      await pickedUp({ rideId: ride.rideId });
    } catch (e) {
      setMsg(e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 p-5 space-y-3">
      <p className="text-xs font-bold tracking-widest text-emerald-300 uppercase">
        {going ? "Pick up" : "Riding — drop off"}
        {ride.how === "dispatcher" && <span className="ml-2 text-amber-300">from dispatch</span>}
      </p>
      <div>
        <p className="text-sm text-slate-500">From</p>
        <p className="text-xl font-bold">{ride.pickup}</p>
        {going && (
          <a href={navUrl(ride.pickupLat, ride.pickupLng, ride.pickup)} target="_blank" rel="noopener noreferrer" className="text-sky-300 font-semibold">
            Navigate &rarr;
          </a>
        )}
      </div>
      {ride.dropoff && (
        <div>
          <p className="text-sm text-slate-500">To</p>
          <p className="text-lg">{ride.dropoff}</p>
          {!going && (
            <a href={navUrl(ride.dropLat, ride.dropLng, ride.dropoff)} target="_blank" rel="noopener noreferrer" className="text-sky-300 font-semibold">
              Navigate &rarr;
            </a>
          )}
        </div>
      )}
      {ride.notes && <p className="text-amber-200">{"\u{1F4DD}"} {ride.notes}</p>}
      <div className="flex flex-wrap gap-2 text-sm">
        {ride.riderName && <span className="rounded-full bg-white/10 px-3 py-1">{ride.riderName}</span>}
        {ride.passengers > 1 && <span className="rounded-full bg-white/10 px-3 py-1">{ride.passengers} riders</span>}
        {ride.wheelchair && <span className="rounded-full bg-sky-500/20 text-sky-200 px-3 py-1">{"♿"} Wheelchair</span>}
        {ride.paymentMethod && <span className="rounded-full bg-white/10 px-3 py-1 capitalize">{ride.paymentMethod}</span>}
      </div>
      {ride.riderPhone && (
        <a href={`tel:${ride.riderPhone}`} className="block text-center rounded-xl py-3 font-bold bg-white/10">
          Call rider
        </a>
      )}
      {going && (
        <button
          disabled={busy}
          onClick={markPickedUp}
          className="w-full rounded-2xl py-4 text-lg font-bold bg-emerald-500 text-navy-950 disabled:opacity-50"
        >
          Picked up
        </button>
      )}
      <button type="button" onClick={() => setEnding(true)} className="w-full min-h-[48px] rounded-2xl border-2 border-white/25 font-bold text-slate-200">
        Can&rsquo;t finish this call
      </button>
      {msg && <p className="text-red-300 text-sm">{msg}</p>}
      {ending && <EndCallSheet ride={ride} onClose={() => setEnding(false)} />}
    </section>
  );
}
