// Member deals shown in the app (the server applies them: functions/lib/memberSavings.mjs).
import { BRAND } from "../config/constants";
import { MEMBER_DEALS_DEFAULTS, ridesToNextReward } from "../../functions/lib/memberSavings.mjs";

export const DEALS = { ...MEMBER_DEALS_DEFAULTS, ...(BRAND.pricing?.memberDeals || {}) };
export const tierReward = (tier) => Number(BRAND.pricing?.tiers?.[tier]?.rewardCents) || 0;
const ACTIVE = ["active", "trialing"];

/** What a signed-in rider has: plan, ride credit (incl. the $3 welcome), rides to the next reward. */
export function memberDealsFor(profile) {
  if (!profile) return null;
  const plan = ACTIVE.includes(profile.subscriptionStatus) ? profile.subscriptionTier : null;
  const welcomeCents = !profile.welcomeCreditAt && !(Number(profile.ridesDone) > 0) ? Math.round(DEALS.welcomeCreditCents || 0) : 0;
  return {
    plan,
    welcomeCents,
    creditCents: Math.max(0, Math.round(Number(profile.rideCreditCents) || 0)) + welcomeCents,
    rewardCents: tierReward(plan),
    every: DEALS.rewardEveryRides,
    ridesToNext: ridesToNextReward(Number(profile.rewardRides) || 0, DEALS),
    priceLock: !!DEALS.priceLock,
  };
}
