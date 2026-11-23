// Price a trip on the booking screen, before the rider pays.
// Uses the map points the rider already gave (picked address, pin or GPS).
// A typed address with no point is looked up once (same free search as the
// address box) only to price it: the found point is NOT saved as the pickup.
import { useEffect, useState } from "react";
import { estimateTrip, priceMiles } from "../../functions/lib/fareEstimate.mjs";
import { maxCardFeeCents, cardFeeCents } from "../../functions/lib/cardFee.mjs";
import { BRAND, FARE_CONFIG } from "../config/constants";
import { searchPlaces } from "./placeSearch";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";

// The road factor the app tunes by itself from real meters (functions/selfCheck.js).
// Read once per visit; until it arrives (or if it's missing) the config value is used.
let tuned = null;
let tuning = null;
function useTunedEstimateCfg() {
  const [, bump] = useState(0);
  useEffect(() => {
    if (tuned || tuning) return;
    tuning = getDoc(doc(db, "publicConfig", "pricing"))
      .then((s) => {
        const f = Number(s.data()?.roadFactor);
        tuned = Number.isFinite(f) && f >= 1 && f <= 2 ? { roadFactor: f } : {};
        bump((n) => n + 1);
      })
      .catch(() => {
        tuned = {};
      });
  }, []);
  return { ...(BRAND.pricing.estimate || {}), ...(tuned || {}) };
}

const point = (lat, lng) => (typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null);

/** Looks up a typed address once; returns {lat, lng} or null. */
function useLookedUpPoint(text, known) {
  const [found, setFound] = useState(null);
  const query = String(text || "").trim();
  useEffect(() => {
    if (known || query.length < 6 || query === "Pin dropped") {
      setFound(null);
      return undefined;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const res = await searchPlaces(query, controller.signal);
      setFound(res[0] ? { lat: res[0].lat, lng: res[0].lng } : null);
    }, 600);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, known]);
  return known || found;
}

/** Most the card fee can be on this fare (a credit card; debit cards pay none). */
export function cardFeeCentsFor(signedIn, fareCents = 0) {
  const cfg = BRAND.pricing?.cardFee;
  if (cfg?.mode === "flat") return cardFeeCents({ baseCents: fareCents || 1, member: signedIn, cfg });
  return maxCardFeeCents(fareCents, cfg || {});
}

/**
 * Estimate for the ride being booked.
 * @returns {null | {miles, fareCents, highCents, cardFeeCents, totalCents, highTotalCents}}
 *   null until both ends have a point, for out-of-area trips (priced by phone), or past maxMiles.
 */
export function useTripEstimate(ride, { signedIn = false } = {}) {
  const estimateCfg = useTunedEstimateCfg();
  const pickup = useLookedUpPoint(ride.pickup, point(ride.pickupLat, ride.pickupLng));
  const dropoff = useLookedUpPoint(ride.dropoff, point(ride.dropoffLat, ride.dropoffLng));
  if (ride.outOfArea || !pickup || !dropoff) return null;
  return estimateTrip({
    points: [pickup, dropoff],
    fare: FARE_CONFIG,
    passengers: ride.passengers,
    roundTrip: !!ride.roundTrip,
    cardFeeCents: (fareCents) => cardFeeCentsFor(signedIn, fareCents),
    cfg: estimateCfg,
  });
}

/** Estimate from road miles the ride already carries (after booking). */
export function estimateFromMiles(miles, ride, { signedIn = false } = {}) {
  if (ride.outOfArea) return null;
  return priceMiles({
    miles: Number(miles),
    fare: FARE_CONFIG,
    passengers: ride.passengers,
    roundTrip: !!ride.roundTrip,
    cardFeeCents: (fareCents) => cardFeeCentsFor(signedIn, fareCents),
    cfg: BRAND.pricing.estimate || {},
  });
}
