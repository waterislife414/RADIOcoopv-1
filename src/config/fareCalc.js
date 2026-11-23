import {
  FARE_CONFIG,
  OUT_OF_AREA_ENTRY_FEE,
  OUT_OF_AREA_MINIMUM_FARE,
} from "./constants";

// Real meter model: the base fare covers only the first 1/6 mile: every
// mile beyond that is billed at PER_MILE (which itself is derived from the
// city's $0.33-per-1/6-mile increment rate: 0.33 * 6 = $1.98/mile).
// This must stay structurally accurate - it's the number used in
// advertising comparisons against Uber/Lyft, so it has to be real.
export function calcFareRange(ride, miles) {
  const { BASE_FARE, PER_MILE, FIRST_INCREMENT_MILES, EXTRA_PAX_FEE, CARD_APP_FEE, HIGH_ESTIMATE_MULTIPLIER } =
    FARE_CONFIG;
  const extraPax = Math.max(0, (ride.passengers || 1) - 1);
  const cardFee = ride.paymentMethod === "card" ? CARD_APP_FEE : 0;
  const billableMiles = Math.max(0, miles - FIRST_INCREMENT_MILES);

  if (ride.outOfArea) {
    let low = OUT_OF_AREA_ENTRY_FEE + miles * PER_MILE + extraPax * EXTRA_PAX_FEE + cardFee;
    if (ride.roundTrip) low *= 2;
    low = Math.max(low, OUT_OF_AREA_MINIMUM_FARE);
    const high = Math.max(low * HIGH_ESTIMATE_MULTIPLIER, OUT_OF_AREA_MINIMUM_FARE);
    return { low, high };
  }

  let low = BASE_FARE + billableMiles * PER_MILE + extraPax * EXTRA_PAX_FEE + cardFee;
  if (ride.roundTrip) low *= 2;
  const high = low * HIGH_ESTIMATE_MULTIPLIER;
  return { low, high };
}

// Plain-dollar fare with no card fee, no round-trip doubling - the "real
// meter fare" for a single one-way trip. This is what's compared against
// national rideshare averages, since rideshare quotes are also one-way,
// pre-tip, pre-fee base prices.
export function calcMeterFareOnly(miles, passengers = 1) {
  const { BASE_FARE, PER_MILE, FIRST_INCREMENT_MILES, EXTRA_PAX_FEE } = FARE_CONFIG;
  const extraPax = Math.max(0, passengers - 1);
  const billableMiles = Math.max(0, miles - FIRST_INCREMENT_MILES);
  return BASE_FARE + billableMiles * PER_MILE + extraPax * EXTRA_PAX_FEE;
}

// National rideshare averages (UberX / Lyft standard, no surge, no promo).
// Each source's published rate card is listed; the comparison uses the
// MEDIAN of every source for each part of the fare. Checked Nov 14, 2026 -
// re-check a few times a year, rideshare prices drift.
export const RIDESHARE_SOURCES = [
  { name: "RideWise rate-card analysis, 300 US cities (UberX)", url: "https://getridewise.com/blog/rideshare-rate-card-analysis-300-cities", base: 1.15, perMile: 0.97, perMin: 0.22, booking: 2.65, minimum: 5.5 },
  { name: "RideWise rate-card analysis, 300 US cities (Lyft)", url: "https://getridewise.com/blog/rideshare-rate-card-analysis-300-cities", base: 1.05, perMile: 0.92, perMin: 0.21, booking: 2.55, minimum: 5.25 },
  { name: "RideWise Uber fare calculator 2026", url: "https://getridewise.com/blog/uber-fare-calculator-2026", base: 1.0, perMile: 0.97, perMin: 0.32, booking: 3.2 },
  { name: "RideWise: How much does Lyft cost", url: "https://getridewise.com/blog/how-much-does-lyft-cost", base: 3.0, perMile: 1.2, perMin: 0.25, booking: 2.85, minimum: 7.5 },
  { name: "RideWise: Lyft price per mile (June 2026)", url: "https://getridewise.com/blog/how-much-is-lyft-per-mile", perMile: 1.15, perMin: 0.2 },
  { name: "DealNews: How much does Uber cost (midpoint of range)", url: "https://www.dealnews.com/features/uber/cost", base: 2.0, perMile: 1.425, perMin: 0.275 },
  { name: "Ridester: Uber rates (midpoint of range)", url: "https://www.ridester.com/uber-rates-cost/", perMile: 1.5, perMin: 0.4 },
  { name: "MyCarCalc Lyft calculator, medium cities", url: "https://mycarcalc.com", base: 1.15, perMile: 0.9, perMin: 0.15, booking: 2.75 },
];

/** Typical busy-time multiplier (rain, rush hour, events) - RideWise surge data, 2026. */
export const RIDESHARE_SURGE = { multiplier: 1.5, source: "https://getridewise.com/blog/how-surge-pricing-works-uber-lyft-algorithm" };

/** Average city trip speed assumed for the per-minute part (30 mph = 2 min/mile). */
export const MINUTES_PER_MILE = 2;

export function median(values) {
  const v = values.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const pick = (key) => median(RIDESHARE_SOURCES.map((s) => s[key]));
export const RIDESHARE_MEDIAN = {
  base: pick("base"),
  perMile: pick("perMile"),
  perMin: pick("perMin"),
  booking: pick("booking"),
  minimum: pick("minimum"),
};

export const RIDESHARE_RATE = { perMile: 2.10, booking: 4.50, asOf: "Aug 5, 2026" };

/**
 * Uber's own published average prices for real Columbus trips (UberX, average
 * over the past month, from uber.com's Columbus city page). This is the
 * strongest proof we have: their numbers, our meter for the same miles.
 * Re-check monthly; Uber says these are not fixed or guaranteed prices.
 * outOfArea trips are priced by phone, so no meter number is shown for them.
 */
export const UBER_COLUMBUS_EXAMPLES = {
  source: "https://www.uber.com/global/en/cities/columbus-ga/",
  checked: "Nov 23, 2026",
  trips: [
    { from: "Best Buy", to: "Walmart Supercenter", miles: 5, uber: 18 },
    { from: "Columbus, GA", to: "Phenix City, AL", miles: 8, uber: 22 },
    { from: "Columbus, GA", to: "Auburn, AL", miles: 39, uber: 64, outOfArea: true },
  ],
};

/** Median national rideshare fare for a trip, at normal (non-surge) rates. */
export function calcRideshareEstimate(miles, surge = 1) {
  return (miles * RIDESHARE_RATE.perMile + RIDESHARE_RATE.booking) * surge;
}

export function calcSavings(miles, passengers = 1) {
  const ours = calcMeterFareOnly(miles, passengers);
  const theirs = calcRideshareEstimate(miles);
  const theirsBusy = calcRideshareEstimate(miles, RIDESHARE_SURGE.multiplier);
  const savings = Math.max(0, theirs - ours);
  const percent = theirs > 0 ? (savings / theirs) * 100 : 0;
  const busySavings = Math.max(0, theirsBusy - ours);
  return { ours, theirs, savings, percent, theirsBusy, busySavings };
}
