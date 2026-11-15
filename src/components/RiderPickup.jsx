import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { BRAND } from "../config/constants";
import RideMap from "./RideMap";
import CallButton from "./CallButton";
import { ring } from "../utils/alertSound";
import { RIDE_RULES, useNow, useShareLocation, phoneAlert, money } from "../utils/rideLive";
import { waitClock, clockText, isAppRide, pickupPoint } from "../../functions/lib/rideTiming.mjs";

const riderArrivalReply = httpsCallable(functions, "riderArrivalReply");
const PASS = BRAND.copy.dayPass;

function once(key, fn) {
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // No storage: alert anyway.
  }
  fn();
}

/** Rider's view from "driver assigned" to pickup: ETA, the 4-minute alert, "Is your driver here?", map and calling. */
export default function RiderPickup({ ride, rideId }) {
  const now = useNow(1000);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertsAsk, setAlertsAsk] = useState(() => "Notification" in window && Notification.permission === "default");
  const waiting = ride.status === "dispatched";
  const sharing = useShareLocation(rideId, waiting && ride.shareLocation !== false && !paused);
  const car = ride.carNumber ? `Car ${ride.carNumber}` : "Your driver";
  const app = isAppRide(ride);

  useEffect(() => {
    if (ride.headsUpAt != null && ride.arrivedAt == null) {
      once(`rc-alert-${rideId}-close`, () => {
        ring(2);
        phoneAlert(`${car} is about ${RIDE_RULES.headsUpMinutes} minutes away`, "Please head outside to meet your driver.");
      });
    }
    if (ride.arrivedAt != null) {
      once(`rc-alert-${rideId}-here`, () => {
        ring(3);
        phoneAlert(`${car} is here`, "Your driver is at the pickup.");
      });
    }
  }, [ride.headsUpAt, ride.arrivedAt, rideId, car]);

  async function answer(reply) {
    setBusy(true);
    try {
      await riderArrivalReply({ rideId, reply });
    } catch {
      // The driver still sees them arrive; nothing to fix here.
    } finally {
      setBusy(false);
    }
  }

  const clock = waitClock(ride, now, RIDE_RULES);
  const eta = ride.eta?.minutes;
  const points = [
    ride.driverPos && { key: "car", ...ride.driverPos, color: "#0f172a", label: `\u{1F695} ${ride.carNumber || ""}`.trim() },
    pickupPoint(ride) && { key: "pickup", ...pickupPoint(ride), color: "#2563eb", label: "P" },
    ride.riderPos && { key: "me", ...ride.riderPos, color: "#059669", label: "You" },
  ].filter(Boolean);

  return (
    <div className="space-y-3 mt-3" data-testid="rider-pickup">
      {waiting && ride.arrivedAt == null && ride.headsUpAt == null && (
        <p className="text-lg font-bold text-slate-800">
          {"\u{1F695}"} {car} is on the way{eta ? ` · about ${eta} min` : ""}
        </p>
      )}
      {waiting && ride.arrivedAt == null && ride.headsUpAt != null && (
        <div className="rounded-2xl bg-amber-100 border-2 border-amber-400 p-4 text-amber-950" role="status">
          <p className="text-xl font-extrabold">
            {car} is about {Math.min(eta || RIDE_RULES.headsUpMinutes, RIDE_RULES.headsUpMinutes)}{" "}
            {Math.min(eta || RIDE_RULES.headsUpMinutes, RIDE_RULES.headsUpMinutes) === 1 ? "minute" : "minutes"} away
          </p>
          <p className="font-semibold">Please head outside to meet your driver.</p>
        </div>
      )}
      {waiting && ride.arrivedAt != null && (
        <div className="rounded-2xl bg-emerald-100 border-2 border-emerald-500 p-4 text-emerald-950 space-y-3" role="status">
          <p className="text-2xl font-extrabold">{car} is here!</p>
          {!ride.riderReply ? (
            <>
              <p className="font-semibold">Is your driver there?</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={busy} onClick={() => answer("here")} className="min-h-[56px] rounded-xl bg-emerald-600 text-white font-extrabold text-lg">
                  I&rsquo;m at the car
                </button>
                <button type="button" disabled={busy} onClick={() => answer("minute")} className="min-h-[56px] rounded-xl bg-white border-2 border-emerald-600 font-extrabold text-lg">
                  Need a minute
                </button>
              </div>
            </>
          ) : (
            <p className="font-semibold">{ride.riderReply.reply === "here" ? "Thanks! Your driver knows you’re there." : "Got it. Your driver knows you’re coming."}</p>
          )}
          {app && clock && (
            <p className="text-sm font-semibold" data-testid="wait-clock">
              {!clock.meterOn
                ? `Free wait: ${clockText(clock.meterAt - now)} left, then the wait meter starts.`
                : !clock.noShowOpen
                  ? `The wait meter is running. After ${clockText(clock.noShowAt - now)} your driver may cancel as a no-show (${money(RIDE_RULES.noShowFee * 100)}).`
                  : `Your driver may now cancel as a no-show (${money(RIDE_RULES.noShowFee * 100)}).`}
            </p>
          )}
        </div>
      )}

      {ride.perks?.liveMap && points.length > 0 && <RideMap points={points} label={`Map showing ${car} and your pickup`} />}
      {!ride.perks?.liveMap && waiting && (
        <Link to={`/fast-pass?ride=${encodeURIComponent(rideId)}`} className="block text-center text-sm font-semibold text-blue-700 underline">
          Watch your driver on the map and call them: {PASS.title}, {PASS.price}
        </Link>
      )}
      {ride.perks?.callDriver && <CallButton rideId={rideId} label={`Call ${car}`} />}

      {waiting && ride.shareLocation !== false && (
        <p className="text-sm text-slate-600">
          {sharing === "on" && !paused && (
            <>
              {"\u{1F4CD}"} Sharing your location with your driver until pickup.{" "}
              <button type="button" className="underline font-semibold min-h-[44px] px-2" onClick={() => setPaused(true)}>
                Stop
              </button>
            </>
          )}
          {paused && (
            <button type="button" className="underline font-semibold" onClick={() => setPaused(false)}>
              {"\u{1F4CD}"} Share my location again
            </button>
          )}
          {sharing === "denied" && "Location is blocked on this phone, so your driver can’t see where you are."}
        </p>
      )}
      {waiting && alertsAsk && (
        <button
          type="button"
          onClick={() => Notification.requestPermission().finally(() => setAlertsAsk(false))}
          className="w-full min-h-[48px] rounded-xl border-2 border-blue-300 bg-white text-blue-700 font-bold"
        >
          {"\u{1F514}"} Alert me when my driver is close
        </button>
      )}
    </div>
  );
}
