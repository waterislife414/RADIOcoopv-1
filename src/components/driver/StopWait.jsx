import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { BRAND } from "../../config/constants";
import { useNow } from "../../utils/rideLive";

const stopWait = httpsCallable(functions, "stopWait");
const STILL_MIN = Number(BRAND.rideRules?.stillWaitingCheckMinutes) || 30;
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const timeOf = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * A stop during the ride. One tap when the rider steps out, one when they're back.
 * The meter keeps running; after the set minutes the driver may end the trip
 * (card rides: charge the meter so far; the rider is warned on their phone).
 */
export default function StopWait({ rideId, wait, onEndTrip }) {
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function act(action) {
    setBusy(true);
    setMsg("");
    try {
      await stopWait({ rideId, action });
    } catch (e) {
      setMsg(e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!wait?.startedAt) {
    return (
      <button type="button" data-testid="stop-start" disabled={busy} onClick={() => act("start")} className="w-full rounded-2xl py-3 text-base font-bold bg-white/10 text-white border-2 border-white/20 disabled:opacity-50">
        {"⏸"} Rider stepped out (stop)
        {msg && <span className="block text-sm text-red-300">{msg}</span>}
      </button>
    );
  }
  const waited = now - wait.startedAt;
  const canEnd = now >= wait.endTripAt;
  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-500/10 p-4 space-y-2" data-testid="stop-wait">
      <p className="text-xl font-bold text-amber-200">Waiting for your rider &middot; {clock(waited)}</p>
      <p className="text-sm text-slate-300">
        The meter keeps running.{" "}
        {canEnd ? "They're past the limit: you can end the trip." : `If they're not back by ${timeOf(wait.endTripAt)}, you can end the trip.`}
      </p>
      {waited >= STILL_MIN * 60000 && <p className="text-sm font-semibold text-amber-200">Still waiting? Tap &ldquo;Rider&rsquo;s back&rdquo; when they return, or end the trip.</p>}
      <button type="button" data-testid="stop-back" disabled={busy} onClick={() => act("end")} className="w-full rounded-2xl py-3 text-lg font-bold bg-emerald-500 text-navy-950 disabled:opacity-50">
        Rider&rsquo;s back
      </button>
      {canEnd && (
        <button type="button" data-testid="stop-end-trip" disabled={busy} onClick={onEndTrip} className="w-full rounded-2xl py-3 text-base font-bold bg-red-500/20 border-2 border-red-400 text-red-100">
          Rider didn&rsquo;t come back: end the trip
        </button>
      )}
      {msg && <p className="text-sm text-red-300">{msg}</p>}
    </div>
  );
}
