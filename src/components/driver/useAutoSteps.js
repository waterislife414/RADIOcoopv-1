// The driver's phone does the routine taps by itself, from GPS (owner request Nov 23, 2026:
// "less button presses, everything automatic"). Every step keeps its button as a backup.
//   1. Moving and parked inside a zone for a bit  -> Check Ready.
//   2. Within ~80 m of the pickup                  -> "I'm here" (tells the rider).
//   3. Leaving the pickup with the rider           -> "Picked up" (rider said "I'm at the car" or their phone is in the car).
//   4. During the trip                             -> measures the trip (app meter reading, a hint for the meter box).
//   5. At the drop-off                              -> opens the drop-off / meter screen.
import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { BRAND, FARE_CONFIG } from "../../config/constants";
import { distanceMeters } from "../../../functions/lib/rideTiming.mjs";
import { meterCents } from "../../../functions/lib/fareEstimate.mjs";

const AUTO = {
  arriveMeters: 80,
  leftPickupMeters: 150,
  riderInCarMeters: 40,
  dropoffMeters: 120,
  parkedSeconds: 45,
  parkedMeters: 60,
  maxAccuracy: 50,
  stoppedSpeedMps: 2, // under ~4.5 mph counts as waiting time on the app reading
  ...(BRAND.dispatch?.auto || {}),
};
const WAIT_CENTS = Math.round((Number(FARE_CONFIG.WAIT_TIME_PER_MINUTE) || 0.35) * 100);
const arrived = httpsCallable(functions, "driverArrived");
const pickedUp = httpsCallable(functions, "driverPickedUp");
const point = (lat, lng) => (Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);

function loadTrip(rideId) {
  try {
    return JSON.parse(sessionStorage.getItem(`rc-trip-${rideId}`) || "null");
  } catch {
    return null;
  }
}
function saveTrip(trip) {
  try {
    sessionStorage.setItem(`rc-trip-${trip.rideId}`, JSON.stringify(trip));
  } catch {
    // No storage: the reading restarts after a reload, nothing else breaks.
  }
}

/** Returns { appMeterCents } (null until the trip has started). */
export function useAutoSteps({ status, board, current, fix, gpsZoneId, canReady, onReady, onAtDropoff }) {
  const done = useRef({});
  const park = useRef(null);
  const [appMeterCents, setAppMeterCents] = useState(null);
  const cur = current && board?.rideId === current.rideId ? current : null;

  useEffect(() => {
    if (!fix || !(fix.accuracy <= AUTO.maxAccuracy)) return;
    const now = Date.now();
    const here = { lat: fix.lat, lng: fix.lng };
    const once = (key, fn) => {
      if (done.current[key]) return;
      done.current[key] = true;
      Promise.resolve()
        .then(fn)
        .catch(() => {
          done.current[key] = false;
        });
    };

    // 1. Parked in a zone while Moving.
    if (status === "moving" && gpsZoneId && canReady) {
      const p = park.current;
      if (!p || p.zone !== gpsZoneId || distanceMeters(p, here) > AUTO.parkedMeters) park.current = { ...here, zone: gpsZoneId, since: now };
      else if (now - p.since >= AUTO.parkedSeconds * 1000) once(`ready-${gpsZoneId}-${Math.floor(now / 300000)}`, onReady);
    } else {
      park.current = null;
    }
    if (!cur) return;

    const pickup = point(cur.pickupLat, cur.pickupLng) || cur.riderPos || cur.bookedFrom || null;
    // 2. At the pickup.
    if (cur.status === "dispatched" && cur.arrivedAt == null && pickup && distanceMeters(here, pickup) <= AUTO.arriveMeters) {
      once(`arrive-${cur.rideId}`, () => arrived({ rideId: cur.rideId, lat: fix.lat, lng: fix.lng, acc: Math.round(fix.accuracy), auto: true }));
    }
    // 3. Leaving with the rider.
    if (cur.status === "dispatched" && cur.arrivedAt != null && pickup && distanceMeters(here, pickup) >= AUTO.leftPickupMeters) {
      const said = cur.riderReply?.reply === "here" && cur.riderReply.at >= cur.arrivedAt;
      const inCar = cur.riderPos?.at > now - 30000 && distanceMeters(here, cur.riderPos) <= AUTO.riderInCarMeters;
      if (said || inCar) once(`picked-${cur.rideId}`, () => pickedUp({ rideId: cur.rideId, auto: true }));
    }
    // 4. The trip, measured (distance while moving, waiting time while stopped).
    if (cur.status === "in_transit") {
      const trip = loadTrip(cur.rideId) || { rideId: cur.rideId, meters: 0, stoppedMs: 0, last: null };
      if (trip.last) {
        const dt = now - trip.last.t;
        const d = distanceMeters(trip.last, here);
        if (dt > 0 && dt < 120000 && d < 2000) {
          if (d / (dt / 1000) < AUTO.stoppedSpeedMps) trip.stoppedMs += dt;
          else trip.meters += d;
        }
      }
      trip.last = { ...here, t: now };
      saveTrip(trip);
      const miles = trip.meters / 1609.344;
      setAppMeterCents(miles > 0.05 ? meterCents(miles, FARE_CONFIG, cur.passengers || 1) + Math.floor(trip.stoppedMs / 60000) * WAIT_CENTS : null);
      // 5. At the drop-off (not while waiting at a stop).
      const drop = point(cur.dropLat, cur.dropLng);
      if (drop && !cur.stopWait?.startedAt && distanceMeters(here, drop) <= AUTO.dropoffMeters) once(`drop-${cur.rideId}-${cur.routeChangedAt || 0}`, onAtDropoff);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix?.lat, fix?.lng, fix?.accuracy, status, gpsZoneId, canReady, cur?.rideId, cur?.status, cur?.arrivedAt, cur?.riderReply?.at, cur?.routeChangedAt, cur?.stopWait?.startedAt]);

  return { appMeterCents: cur?.status === "in_transit" ? appMeterCents : null };
}
