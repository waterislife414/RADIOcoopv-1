// cardFee.mjs — the card fee, as high as the card rules and Georgia law allow.
// Pure, no Firebase. Shared by the rider screens and Cloud Functions.
// All money is integer cents.
//
// Rules this follows (research Nov 23, 2026; lawyer to confirm, see docs/LAWYER-REVIEW.md):
//  - Visa/Mastercard: a surcharge only on CREDIT cards; never on debit or prepaid
//    cards (even run as credit). Visa caps a U.S. credit surcharge at 3%.
//  - Georgia: a credit-card surcharge can't be more than the merchant's cost to
//    accept the card (Stripe: about 2.9% + 30 cents).
//  => credit: the lower of 3% and the processing cost; debit/prepaid/unknown: $0.
//
// mode "flat" keeps the old flat fee ($2 / $1.80) only for a client whose lawyer
// approves it; it is not the default.

export const CARD_FEE_DEFAULTS = Object.freeze({
  mode: "credit_surcharge", // "credit_surcharge" | "flat" | "none"
  creditPercent: 3, // network cap
  processorPercent: 2.9, // processor cost: percent part
  processorFixedCents: 30, // processor cost: fixed part
  flatCents: 200,
  flatMemberCents: 180,
});

/**
 * @param {{baseCents:number, funding?:string, member?:boolean, cfg?:object}} p
 *   baseCents = the amount the fee is figured on (meter fare + tip), cents.
 *   funding   = Stripe card.funding: "credit" | "debit" | "prepaid" | "unknown".
 * @returns {number} fee in cents (never negative)
 */
export function cardFeeCents({ baseCents, funding = "unknown", member = false, cfg = {} }) {
  const c = { ...CARD_FEE_DEFAULTS, ...cfg };
  const base = Math.max(0, Math.round(Number(baseCents) || 0));
  if (c.mode === "none" || base <= 0) return 0;
  if (c.mode === "flat") return Math.max(0, Math.round(member ? c.flatMemberCents : c.flatCents));
  if (funding !== "credit") return 0;
  const cap = Math.floor((base * c.creditPercent) / 100);
  const cost = Math.round((base * c.processorPercent) / 100 + c.processorFixedCents);
  return Math.max(0, Math.min(cap, cost));
}

/** Most a rider could pay in card fee on this amount (a credit card), for "up to" wording before the card is known. */
export function maxCardFeeCents(baseCents, cfg = {}) {
  return cardFeeCents({ baseCents, funding: "credit", cfg });
}

/** One plain line for the screens. */
export function cardFeeRule(cfg = {}) {
  const c = { ...CARD_FEE_DEFAULTS, ...cfg };
  if (c.mode === "none") return "No card fee.";
  if (c.mode === "flat") return `$${(c.flatCents / 100).toFixed(2)} card fee ($${(c.flatMemberCents / 100).toFixed(2)} with a free account).`;
  return `Credit cards: up to ${c.creditPercent}%. Debit cards: no fee.`;
}
