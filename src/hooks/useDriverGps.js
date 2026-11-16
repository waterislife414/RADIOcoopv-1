import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { BRAND } from "../config/constants";
import { metersBetween } from "../../functions/lib/dispatchCore.mjs";

const GPS = { minMoveMeters: 50, maxIntervalSec: 45, maxAccuracyMeters: 100, ...(BRAND.dispatch?.gps || {}) };
export const MAX_ACCURACY_M = GPS.maxAccuracyMeters;
const MAX_INTERVAL_MS = GPS.maxIntervalSec * 1000;
// Never a cached position, never a coarse (IP/Wi-Fi) one.
const FIX_OPTS = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };
const ping = httpsCallable(functions, "driverPing");

function toFix(p) {
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, t: Date.now() };
}

function errorText(err) {
  if (err?.code === 1) return "Location is blocked. Allow location for this site in your phone settings, then reload.";
  if (err?.code === 3) return "Still looking for your location…";
  return "Can't get your location. Make sure Location is on.";
}

/**
 * Shares the driver's location with dispatch while `active`:
 * sends a fix every minMoveMeters moved, and at least every maxIntervalSec.
 * Also keeps the screen awake (a PWA stops getting GPS in the background).
 *
 * gps: 'off' | 'starting' | 'ok' | 'searching' | 'denied' | 'unavailable'
 */
export function useDriverGps(active) {
  const [state, setState] = useState({ gps: "off", fix: null, gpsZoneId: null, error: "", sentAt: null });
  const latest = useRef(null);
  const lastSent = useRef(null);
  const inFlight = useRef(false);

  const send = useCallback(async (fix, force = false) => {
    const prev = lastSent.current;
    const due =
      force ||
      !prev ||
      Date.now() - prev.t >= MAX_INTERVAL_MS - 2000 ||
      metersBetween(prev, fix) >= GPS.minMoveMeters;
    if (!due || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await ping({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });
      lastSent.current = { ...fix, t: Date.now() };
      setState((s) => ({ ...s, gpsZoneId: res.data.gpsZoneId ?? null, sentAt: Date.now() }));
    } catch {
      // Network blip: the next fix or the interval retries.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      setState((s) => ({ ...s, gps: "off" }));
      return undefined;
    }
    if (!("geolocation" in navigator)) {
      setState((s) => ({ ...s, gps: "unavailable", error: "This phone can't share location from the browser." }));
      return undefined;
    }
    setState((s) => ({ ...s, gps: s.fix ? s.gps : "starting" }));

    const onPos = (p) => {
      const fix = toFix(p);
      latest.current = fix;
      setState((s) => ({ ...s, gps: "ok", fix, error: "" }));
      send(fix);
    };
    const onErr = (err) => {
      setState((s) => ({ ...s, gps: err?.code === 1 ? "denied" : "searching", error: errorText(err) }));
    };
    const fresh = () => navigator.geolocation.getCurrentPosition(onPos, onErr, FIX_OPTS);

    const watchId = navigator.geolocation.watchPosition(onPos, onErr, FIX_OPTS);
    // watchPosition can go quiet while parked; force a fix on the interval.
    const timer = setInterval(fresh, MAX_INTERVAL_MS);

    let lock = null;
    const keepAwake = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Battery saver or unsupported browser: GPS still works while the screen is on.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        keepAwake();
        fresh();
      }
    };
    keepAwake();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, [active, send]);

  /** Latest fix if under a minute old, otherwise asks the phone for a new one. */
  const getFix = useCallback(
    () =>
      new Promise((resolve, reject) => {
        const f = latest.current;
        if (f && Date.now() - f.t < 15_000) return resolve(f);
        if (!("geolocation" in navigator)) return reject(new Error("This phone can't share location."));
        navigator.geolocation.getCurrentPosition(
          (p) => {
            const fix = toFix(p);
            latest.current = fix;
            setState((s) => ({ ...s, gps: "ok", fix, error: "" }));
            resolve(fix);
          },
          (err) => {
            setState((s) => ({ ...s, gps: err?.code === 1 ? "denied" : "searching", error: errorText(err) }));
            reject(new Error(errorText(err)));
          },
          FIX_OPTS
        );
      }),
    []
  );

  /** Record that a status callable just reported this zone (no extra ping needed). */
  const noteZone = useCallback((gpsZoneId, fix) => {
    if (fix) lastSent.current = { ...fix, t: Date.now() };
    setState((s) => ({ ...s, gpsZoneId: gpsZoneId ?? null, sentAt: Date.now() }));
  }, []);

  return { ...state, getFix, noteZone };
}
