// fareEstimate.mjs — price a trip before it is booked, from the two map points.
// Pure, no Firebase. Shared by the rider screens (Vite: import from
// '../../functions/lib/fareEstimate.mjs') and, later, Cloud Functions.
// All money is integer cents. The meter counts in 1/6-mile steps, so the
// estimate does too.

import { metersBetween } from "./dispatchCore.mjs";

export const ESTIMATE_DEFAULTS = Object.freeze({
  // Straight line to road miles. City trips run about 1.2-1.4x the crow-fly distance.
  roadFactor: 1.3,
  // The high end of the range covers detours, traffic lights and wait at stops.
  highMultiplier: 1.15,
  // Beyond this the app does not guess; the rider calls for a price.
  maxMiles: 60,
});

const METERS_PER_MILE = 1609.344;

/** Straight-line miles between two {lat, lng} points. null if either is missing. */
export function straightMiles(a, b) {
  if (!isPoint(a) || !isPoint(b)) return null;
  return metersBetween(a, b) / METERS_PER_MILE;
}

export function isPoint(p) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

/** Road miles along pickup -> stops -> drop-off, using the road factor. */
export function roadMiles(points, roadFactor = ESTIMATE_DEFAULTS.roadFactor) {
  const pts = points.filter(isPoint);
  if (pts.length < 2 || pts.length !== points.length) return null;
  let miles = 0;
  for (let i = 1; i < pts.length; i++) miles += straightMiles(pts[i - 1], pts[i]);
  return miles * roadFactor;
}

/**
 * Meter fare for a distance, in cents: the flag drop covers the first step
 * (1/6 mile), then each started 1/6 mile adds one increment.
 * fare = { BASE_FARE, PER_MILE, FIRST_INCREMENT_MILES, EXTRA_PAX_FEE } in dollars (branding.config.json).
 */
export function meterCents(miles, fare, passengers = 1) {
  const base = Math.round(fare.BASE_FARE * 100);
  const stepMiles = fare.FIRST_INCREMENT_MILES || 1 / 6;
  const stepCents = Math.round(fare.PER_MILE * 100 * stepMiles);
  const billable = Math.max(0, miles - stepMiles);
  // Small epsilon so 3.0 miles counts 17 steps, not 18, after float error.
  const steps = Math.ceil(billable / stepMiles - 1e-9);
  const extraPax = Math.max(0, (passengers || 1) - 1) * Math.round((fare.EXTRA_PAX_FEE || 0) * 100);
  return base + steps * stepCents + extraPax;
}

/**
 * Estimate a trip.
 * @param {{points: Array<{lat:number,lng:number}>, fare: object, passengers?: number,
 *          roundTrip?: boolean, cardFeeCents?: number, cfg?: object}} p
 * @returns {null | {miles:number, fareCents:number, highCents:number, cardFeeCents:number,
 *                   totalCents:number, highTotalCents:number}}
 *   fareCents = meter estimate (one way, or both ways for a round trip), no card fee.
 *   totalCents = fareCents + card fee (the card fee is charged once).
 *   null = can't estimate (missing points, or too far to guess).
 */
export function estimateTrip({ points, fare, passengers = 1, roundTrip = false, cardFeeCents = 0, cfg = {} }) {
  const c = { ...ESTIMATE_DEFAULTS, ...cfg };
  const miles = roadMiles(points || [], c.roadFactor);
  return priceMiles({ miles, fare, passengers, roundTrip, cardFeeCents, cfg });
}

/** Same result as estimateTrip, from road miles already known (e.g. saved on the ride). */
export function priceMiles({ miles, fare, passengers = 1, roundTrip = false, cardFeeCents = 0, cfg = {} }) {
  const c = { ...ESTIMATE_DEFAULTS, ...cfg };
  if (miles == null || !Number.isFinite(miles) || miles <= 0 || miles > c.maxMiles) return null;
  const oneWay = meterCents(miles, fare, passengers);
  const fareCents = roundTrip ? oneWay * 2 : oneWay;
  const highOneWay = meterCents(miles * c.highMultiplier, fare, passengers);
  const highCents = roundTrip ? highOneWay * 2 : highOneWay;
  const fee = Math.max(0, Math.round(cardFeeCents || 0));
  return {
    miles: Math.round(miles * 10) / 10,
    fareCents,
    highCents,
    cardFeeCents: fee,
    totalCents: fareCents + fee,
    highTotalCents: highCents + fee,
  };
}

export const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
