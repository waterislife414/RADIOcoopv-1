// fareEstimate.mjs — price a trip before it is booked, from the two map points.
// Pure, no Firebase. Shared by the rider screens (Vite: import from
// '../../functions/lib/fareEstimate.mjs') and, later, Cloud Functions.
// All money is integer cents. The meter counts in 1/6-mile steps, so the
// estimate does too.

import { metersBetween } from "./dispatchCore.mjs";

export const ESTIMATE_DEFAULTS = Object.freeze({
  // Straight line to road miles. City trips run about 1.2-1.4x the crow-fly distance.
  roadFactor: 1.35, // same as rideRules.roadFactor (pickup ETA)
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
 *          roundTrip?: boolean, cardFeeCents?: number | ((fareCents:number) => number), cfg?: object}} p
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
  // cardFeeCents: a number, or (fareCents) => cents for a percent fee.
  const feeOf = (cents) => Math.max(0, Math.round((typeof cardFeeCents === "function" ? cardFeeCents(cents) : cardFeeCents) || 0));
  const fee = feeOf(fareCents);
  return {
    miles: Math.round(miles * 10) / 10,
    fareCents,
    highCents,
    cardFeeCents: fee,
    totalCents: fareCents + fee,
    highTotalCents: highCents + feeOf(highCents),
  };
}

export const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Driver-entered meter: a sanity check, and learning from real meters.

export const DRIVER_METER_DEFAULTS = Object.freeze({ maxCents: 25000, maxTimesEstimate: 2.5, slackCents: 1500 });

/**
 * Is a typed meter amount believable for this trip?
 * Allowed up to maxTimesEstimate x the estimate plus slack (wait time, stops, detours),
 * and never above maxCents. Without an estimate only maxCents applies.
 * @returns {{ok:boolean, estFareCents:number|null, limitCents:number}}
 */
export function meterCheck({ meterCents, estMiles, fare, passengers = 1, cfg = {}, estimateCfg = {} }) {
  const c = { ...DRIVER_METER_DEFAULTS, ...cfg };
  const est = priceMiles({ miles: Number(estMiles), fare, passengers, cfg: estimateCfg });
  const estFareCents = est ? est.fareCents : null;
  const limitCents = estFareCents == null
    ? c.maxCents
    : Math.min(c.maxCents, Math.round(estFareCents * c.maxTimesEstimate + c.slackCents));
  const m = Math.round(Number(meterCents) || 0);
  return { ok: m > 0 && m <= limitCents, estFareCents, limitCents };
}

/** Road miles the meter charged for, ignoring wait time and extra riders (the inverse of meterCents). */
export function impliedMiles(meterCents, fare, passengers = 1) {
  const base = Math.round(fare.BASE_FARE * 100);
  const stepMiles = fare.FIRST_INCREMENT_MILES || 1 / 6;
  const stepCents = Math.round(fare.PER_MILE * 100 * stepMiles);
  const extraPax = Math.max(0, (passengers || 1) - 1) * Math.round((fare.EXTRA_PAX_FEE || 0) * 100);
  const steps = Math.max(0, (Math.round(meterCents) - base - extraPax) / stepCents);
  return stepMiles + steps * stepMiles;
}

/**
 * Learn the road factor from finished rides: meter miles vs. estimated miles.
 * samples = [{ estMiles, meterCents, passengers }] (estMiles already include the current road factor).
 * Needs at least minRides; returns the median-based factor, rounded to 0.05 and kept within 1.0-2.0.
 */
export function suggestRoadFactor(samples, fare, currentFactor = ESTIMATE_DEFAULTS.roadFactor, minRides = 20) {
  const ratios = (samples || [])
    .filter((s) => Number(s.estMiles) >= 0.5 && Number(s.meterCents) > 0)
    .map((s) => impliedMiles(s.meterCents, fare, s.passengers) / Number(s.estMiles))
    .filter((r) => Number.isFinite(r) && r > 0.3 && r < 4)
    .sort((a, b) => a - b);
  if (ratios.length < minRides) return { rides: ratios.length, factor: null, medianRatio: null };
  const mid = Math.floor(ratios.length / 2);
  const medianRatio = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  const factor = Math.min(2, Math.max(1, Math.round((currentFactor * medianRatio) / 0.05) * 0.05));
  return { rides: ratios.length, factor: Math.round(factor * 100) / 100, medianRatio: Math.round(medianRatio * 1000) / 1000 };
}
