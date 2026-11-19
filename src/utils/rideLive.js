import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { BRAND } from "../config/constants";
import { rulesFrom } from "../../functions/lib/rideTiming.mjs";

// Same numbers the server uses (branding.config.json -> rideRules).
export const RIDE_RULES = rulesFrom(BRAND.rideRules);

const riderPing = httpsCallable(functions, "riderPing");

/** Ticks every `ms` so clocks on screen count down. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * While `on`, sends the rider's location (at most every 15 seconds) so their
 * driver can find them. Only while this screen is open: phones don't let a
 * web app track in the background.
 */
export function useShareLocation(rideId, on) {
  const [state, setState] = useState("off");
  useEffect(() => {
    if (!on || !rideId || !navigator.geolocation) {
      setState(on && !navigator.geolocation ? "unavailable" : "off");
      return undefined;
    }
    let last = 0;
    setState("starting");
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setState("on");
        const now = Date.now();
        if (now - last < 15000) return;
        last = now;
        riderPing({ rideId, lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }).catch(() => {});
      },
      (e) => setState((s) => (e?.code === 1 ? "denied" : s === "on" || e?.code === 3 ? s : "unavailable")),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [rideId, on]);
  return state;
}

/** One location reading for booking: { fix } or { denied } or { unavailable }. */
export function readLocationOnce(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ unavailable: true });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ fix: { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) } }),
      (e) => resolve(e?.code === 1 ? { denied: true } : { unavailable: true }),
      { enableHighAccuracy: true, maximumAge: 30000, timeout }
    );
  });
}

/** Phone alert (only if the rider allowed alerts). Sound and vibration are on screen. */
export function phoneAlert(title, body) {
  try {
    navigator.vibrate?.([300, 120, 300]);
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, tag: title });
  } catch {
    // Alerts are a bonus; the screen still shows it.
  }
}

export const money = (cents) => `$${(cents / 100).toFixed(2)}`;
