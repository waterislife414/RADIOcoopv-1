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

// Rough current national rideshare averages (UberX/Lyft standard, non-surge,
// no promo) used only for the savings comparison - update these periodically
// since rideshare pricing drifts. Sourced from published per-mile cost
// ranges; kept conservative (low end of published ranges) so the "you
// saved" claim is defensible, not exaggerated.
export const RIDESHARE_BENCHMARK = {
  perMile: 2.10,
  bookingFee: 4.50,
};

export function calcRideshareEstimate(miles) {
  return miles * RIDESHARE_BENCHMARK.perMile + RIDESHARE_BENCHMARK.bookingFee;
}

export function calcSavings(miles, passengers = 1) {
  const ours = calcMeterFareOnly(miles, passengers);
  const theirs = calcRideshareEstimate(miles);
  const savings = Math.max(0, theirs - ours);
  const percent = theirs > 0 ? (savings / theirs) * 100 : 0;
  return { ours, theirs, savings, percent };
}
