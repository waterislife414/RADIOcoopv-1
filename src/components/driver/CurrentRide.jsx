import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { ring } from "../../utils/alertSound";

const pickedUp = httpsCallable(functions, "driverPickedUp");

function navUrl(lat, lng, address) {
  const dest = typeof lat === "number" ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest || "")}`;
}

/** The call this driver is on: where to go, who to call, Picked Up. Drop Off is on the status card. */
export default function CurrentRide({ ride }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
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
      {msg && <p className="text-red-300 text-sm">{msg}</p>}
    </section>
  );
}
