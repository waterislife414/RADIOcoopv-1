// Member deals and who pays the card company: pure math, shared by Cloud
// Functions, the app and tests. Money is integer cents.
//
// Chosen Nov 23, 2026:
//   - No card fee for riders: same price cash or card.
//   - The card company's cut (2.9% + 30c) comes out of the driver's card-fare
//     credit, like most cab companies; tips stay 100% the driver's.
//   - Price Lock: a signed-in rider paying by card never pays more than the top
//     of the price shown, plus waiting the rider caused. The company covers the
//     gap; the driver is still credited the full meter.
//   - Ride credit ($3 welcome, plan rewards every 10 rides) comes off the next
//     card ride automatically. The company pays it; the driver gets the full meter.
import { priceMiles } from "./fareEstimate.mjs";

export const MEMBER_DEALS_DEFAULTS = Object.freeze({ priceLock: true, welcomeCreditCents: 300, rewardEveryRides: 10, rewardMinFareCents: 500 });
export const CARD_COST_DEFAULTS = Object.freeze({ percent: 2.9, fixedCents: 30, paidBy: "driver" });

const cents = (n) => Math.max(0, Math.round(Number(n) || 0));

/** What the card company takes on a charge of this size. */
export function cardCostCents(amountCents, cost = CARD_COST_DEFAULTS) {
  const c = { ...CARD_COST_DEFAULTS, ...cost };
  const a = cents(amountCents);
  return a > 0 ? Math.round((a * c.percent) / 100) + cents(c.fixedCents) : 0;
}

/** Signed-in rider (not a guest or a phone booking). */
export const isMember = (ride) => !!ride?.customerId && ride.customerId !== "guest";

/** The rider changed the drop-off or made a stop during the ride: the meter decides, nothing is locked. */
export const tripChanged = (ride) => !!ride?.routeChangedAt || (Number(ride?.stopCount) || 0) > 0;

/**
 * Price Lock: the most a member pays for this trip by card, or null when there is no lock
 * (guests, out-of-area, stops, no estimate, or the trip changed during the ride). Top of the range shown at booking + waiting
 * after the free minutes (the rider's own waiting is never locked).
 */
export function priceLockCapCents({ ride, fare, estimateCfg = {}, waitPerMinuteCents = 35, waitGraceMinutes = 2, deals = {} }) {
  const d = { ...MEMBER_DEALS_DEFAULTS, ...deals };
  if (!d.priceLock || !isMember(ride) || ride.outOfArea || (ride.stops || []).length || tripChanged(ride)) return null;
  const p = priceMiles({ miles: Number(ride.estMiles), fare, passengers: ride.passengers || 1, roundTrip: !!ride.roundTrip, cfg: estimateCfg });
  if (!p) return null;
  const waitedMin = Math.ceil(cents(ride.waitedMs) / 60000);
  return p.highCents + Math.max(0, waitedMin - waitGraceMinutes) * cents(waitPerMinuteCents);
}

/**
 * The card charge for a ride, line by line.
 * meterCents: what the meter says. capCents: Price Lock (null = none). creditCents: ride credit available.
 * Returns lockOffCents and creditUsedCents (the company pays both), fareChargeCents + tipCents = chargeCents,
 * and driverCardCostCents (taken from the driver's credit when cost.paidBy is "driver").
 */
export function fareBreakdown({ meterCents, tipCents = 0, capCents = null, creditCents = 0, cost = CARD_COST_DEFAULTS, card = true }) {
  const meter = cents(meterCents);
  const tip = cents(tipCents);
  const lockOffCents = capCents != null ? Math.max(0, meter - cents(capCents)) : 0;
  const afterLock = meter - lockOffCents;
  const creditUsedCents = Math.min(cents(creditCents), afterLock);
  const fareChargeCents = afterLock - creditUsedCents;
  const c = { ...CARD_COST_DEFAULTS, ...cost };
  return {
    meterCents: meter,
    lockOffCents,
    creditUsedCents,
    fareChargeCents,
    tipCents: tip,
    chargeCents: fareChargeCents + tip,
    // Same rule on every card ride: meter less 2.9% + 30c, whatever the rider's discounts.
    driverCardCostCents: card && c.paidBy === "driver" ? cardCostCents(meter, c) : 0,
  };
}

/** Does this finished ride count toward the plan reward? (Unknown fares count.) */
export function countsForReward(ride, deals = {}) {
  const d = { ...MEMBER_DEALS_DEFAULTS, ...deals };
  if (!isMember(ride)) return false;
  const fare = ride.meterCents ?? (ride.finalFare != null ? Math.round(ride.finalFare * 100) : ride.estFareCents);
  return fare == null || cents(fare) >= cents(d.rewardMinFareCents);
}

/** Ride credit earned when a plan member's counted rides reach this number. */
export function rewardFor(countedRides, tierRewardCents, deals = {}) {
  const every = Math.max(1, Math.round(Number({ ...MEMBER_DEALS_DEFAULTS, ...deals }.rewardEveryRides) || 10));
  return countedRides > 0 && countedRides % every === 0 ? cents(tierRewardCents) : 0;
}

/** Rides left until the next reward (every..1). */
export function ridesToNextReward(countedRides, deals = {}) {
  const every = Math.max(1, Math.round(Number({ ...MEMBER_DEALS_DEFAULTS, ...deals }.rewardEveryRides) || 10));
  return every - (Math.max(0, Math.round(countedRides || 0)) % every);
}
