import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { ring } from "../../utils/alertSound";
import { reasonsFor } from "../../../functions/lib/callIssues.mjs";
import { quickFix } from "../../utils/quickFix";
import CallButton from "../CallButton";
import RideMap from "../RideMap";
import { RIDE_RULES, useNow, money } from "../../utils/rideLive";
import { waitClock, clockText } from "../../../functions/lib/rideTiming.mjs";

const pickedUp = httpsCallable(functions, "driverPickedUp");
const driverEndCall = httpsCallable(functions, "driverEndCall");
const driverArrived = httpsCallable(functions, "driverArrived");

const nearPickup = (ride) => Number.isFinite(ride.arrivedDistM) && ride.arrivedDistM <= RIDE_RULES.nearPickupMeters;

/** Where the rider's phone is (live, or where they booked from) next to the pickup and this car. */
function FindRider({ ride, onClose }) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition((p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, {
      enableHighAccuracy: true,
      maximumAge: 10000,
    });
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  const spot = ride.riderPos || ride.bookedFrom;
  const mins = spot?.at ? Math.max(0, Math.round((Date.now() - spot.at) / 60000)) : null;
  const points = [
    Number.isFinite(ride.pickupLat) && { key: "pickup", lat: ride.pickupLat, lng: ride.pickupLng, color: "#2563eb", label: "P" },
    spot && { key: "rider", ...spot, color: "#059669", label: "Rider" },
    me && { key: "me", ...me, color: "#0f172a", label: "You" },
  ].filter(Boolean);
  return (
    <div className="fixed inset-0 z-[75] bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Find rider">
      <div className="w-full max-w-md rounded-3xl bg-navy-900 border border-white/15 p-4 space-y-3 text-white">
        <p className="text-xl font-bold">Find your rider</p>
        <RideMap points={points} height={300} label="Map of the pickup, your rider and you" />
        <p className="text-sm text-slate-300">
          {ride.riderPos
            ? `Green = your rider's phone${mins != null ? `, ${mins === 0 ? "just now" : `${mins} min ago`}` : ""}.`
            : spot
              ? "Green = where your rider's phone was when they booked."
              : "Your rider isn't sharing their location. Call them."}{" "}
          Blue = the address they typed.
        </p>
        {spot && (
          <a href={navUrl(spot.lat, spot.lng)} target="_blank" rel="noopener noreferrer" className="block text-center rounded-xl py-3 font-bold bg-emerald-500 text-navy-950">
            Navigate to the rider &rarr;
          </a>
        )}
        <button type="button" onClick={onClose} className="w-full min-h-[48px] rounded-xl border-2 border-white/25 font-bold">
          Close
        </button>
      </div>
    </div>
  );
}

/** "Can't finish this call": pick why, write what happened, send. */
function EndCallSheet({ ride, onClose, initialReason = null, noShowOpen = true }) {
  const [reason, setReason] = useState(initialReason);
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
                disabled={r.id === "no_show" && !noShowOpen}
                onClick={() => setReason(r.id)}
                className={`w-full min-h-[52px] rounded-2xl border-2 px-4 text-left font-bold text-lg disabled:opacity-40 ${r.warnings ? "border-red-400/70" : "border-white/20"}`}
              >
                {r.label}
                {r.warnings > 0 && <span className="block text-sm font-semibold text-red-300">Counts as {r.warnings} warnings</span>}
                {r.id === "no_show" && !noShowOpen && (
                  <span className="block text-sm font-semibold text-slate-300">Opens {RIDE_RULES.noShowAfterMinutes} minutes after you tap I&rsquo;m here</span>
                )}
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
  const [finding, setFinding] = useState(false);
  const now = useNow(1000);
  const rung = useRef(null);
  const meterRung = useRef(null);
  const clock = ride ? waitClock(ride, now, RIDE_RULES) : null;
  // Two beeps when the free wait is over: time to start the meter.
  useEffect(() => {
    if (ride?.status === "dispatched" && clock?.meterOn && meterRung.current !== ride.rideId) {
      meterRung.current = ride.rideId;
      ring(2);
    }
  }, [clock?.meterOn, ride?.rideId, ride?.status]);
  // Ring when dispatch hands him a call (he didn't tap Accept, so he may not be looking).
  useEffect(() => {
    if (ride?.how === "dispatcher" && rung.current !== ride.rideId && Date.now() - (ride.assignedAt || 0) < 60_000) {
      rung.current = ride.rideId;
      ring(3);
    }
  }, [ride?.rideId, ride?.how, ride?.assignedAt]);
  if (!ride) return null;
  const going = ride.status === "dispatched";
  const arrived = ride.arrivedAt != null;
  const noShowOpen = !ride.appRide || (arrived && clock?.noShowOpen);

  async function markArrived() {
    setBusy(true);
    setMsg("");
    try {
      const fix = await quickFix();
      const { data } = await driverArrived({ rideId: ride.rideId, ...(fix || {}) });
      if (ride.appRide && data?.near === false) {
        setMsg("You look far from the pickup. A no-show fee is only charged when you're at the pickup.");
      }
    } catch (e) {
      setMsg(e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

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
      {ride.cardHold && <p className="text-sm text-emerald-300 font-semibold">{"\u2713"} Card on file: the fare is covered.</p>}
      {going && ride.paymentMethod === "cash" && <p className="text-sm text-amber-300 font-semibold">Cash rider. Collecting up front is your call.</p>}
      <div className="grid grid-cols-2 gap-2">
        {ride.riderPhone && <CallButton rideId={ride.rideId} label="Call rider" fallbackTel={ride.riderPhone} dark />}
        {going && (
          <button type="button" onClick={() => setFinding(true)} className="w-full min-h-[52px] rounded-xl font-bold bg-white/10 border-2 border-white/25">
            {"\u{1F4CD}"} Find rider
          </button>
        )}
      </div>
      {going && !arrived && (
        <button disabled={busy} onClick={markArrived} className="w-full rounded-2xl py-4 text-lg font-bold bg-amber-400 text-navy-950 disabled:opacity-50">
          I&rsquo;m here
        </button>
      )}
      {going && arrived && clock && (
        <div className="rounded-2xl bg-white/10 p-4 space-y-1" data-testid="driver-wait">
          <p className="text-sm text-slate-300">Waiting at the pickup</p>
          <p className="text-3xl font-mono font-bold">{clockText(clock.waitedMs)}</p>
          <p className={`font-bold ${clock.meterOn ? "text-amber-300" : "text-slate-200"}`}>
            {clock.meterOn ? "\u25B6 Start your meter: wait time is running." : `Free wait. Start your meter at ${RIDE_RULES.waitGraceMinutes}:00.`}
          </p>
          {ride.riderReply && (
            <p className="font-bold text-emerald-300">Rider says: {ride.riderReply.reply === "here" ? "\u201cI'm at the car\u201d" : "\u201cNeed a minute\u201d"}</p>
          )}
          {ride.appRide && !clock.noShowOpen && (
            <p className="text-sm text-slate-300">No-show opens in {clockText(clock.noShowAt - now)}.</p>
          )}
          {ride.appRide && clock.noShowOpen && (
            <button type="button" onClick={() => setEnding("no_show")} className="w-full min-h-[52px] rounded-xl border-2 border-red-400 font-bold text-red-200 mt-2">
              Rider didn&rsquo;t show up {nearPickup(ride) ? `(${money(RIDE_RULES.noShowFee * 100)} to you)` : "(no fee: you weren't at the pickup)"}
            </button>
          )}
        </div>
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
      <button type="button" onClick={() => setEnding("menu")} className="w-full min-h-[48px] rounded-2xl border-2 border-white/25 font-bold text-slate-200">
        Can&rsquo;t finish this call
      </button>
      {msg && <p className="text-red-300 text-sm">{msg}</p>}
      {ending && (
        <EndCallSheet ride={ride} initialReason={ending === "no_show" ? "no_show" : null} noShowOpen={!!noShowOpen} onClose={() => setEnding(false)} />
      )}
      {finding && <FindRider ride={ride} onClose={() => setFinding(false)} />}
    </section>
  );
}
