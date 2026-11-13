import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { ring } from "../../utils/alertSound";

const claim = httpsCallable(functions, "claimBroadcast");

/** "Need a car in [zone]": first driver to tap Take it gets the call. */
export default function BroadcastList({ broadcasts }) {
  const list = Object.values(broadcasts || {})
    .filter(Boolean)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const seen = useRef(new Set());
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");

  const ids = list.map((b) => b.rideId).join(",");
  useEffect(() => {
    const fresh = ids.split(",").filter((id) => id && !seen.current.has(id));
    fresh.forEach((id) => seen.current.add(id));
    if (fresh.length) ring(2);
  }, [ids]);

  if (!list.length) return null;

  async function take(rideId) {
    setBusyId(rideId);
    setMsg("");
    try {
      await claim({ rideId });
    } catch (e) {
      setMsg(e?.message || "Couldn't take it. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      {list.map((b) => (
        <div key={b.rideId} className="rounded-2xl border-2 border-amber-400 bg-amber-400/10 p-4">
          <p className="font-bold text-amber-300 text-lg">
            {"\u{1F4E3}"} Need a car{b.zoneLabel ? ` in ${b.zoneLabel}` : ""}
          </p>
          <p className="text-white mt-1">{b.pickup}</p>
          {b.dropoff && <p className="text-slate-300 text-sm">&rarr; {b.dropoff}</p>}
          {b.wheelchair && <p className="text-sky-200 text-sm mt-1">{"♿"} Wheelchair</p>}
          <button
            disabled={!!busyId}
            onClick={() => take(b.rideId)}
            className="mt-3 w-full rounded-xl py-3 text-lg font-bold bg-amber-400 text-navy-950 disabled:opacity-50"
          >
            {busyId === b.rideId ? "Taking it…" : "Take it"}
          </button>
        </div>
      ))}
      {msg && <p className="text-red-300 text-sm">{msg}</p>}
    </section>
  );
}
