// ============================================================
// DO NOT EDIT COMPANY VALUES HERE.
// All client-specific values live in /branding.config.json —
// this file just re-exports them under the names the app uses.
// ============================================================
import branding from "../../branding.config.json";

export const BRAND = branding;

// --- Company identity ---
export const COMPANY_NAME = branding.company.name;
export const COMPANY_WORDMARK = branding.company.wordmark;
export const COMPANY_TAGLINE = branding.company.tagline;
export const HUB_NAME = branding.company.hubName;
export const COMPANY_PHONE_DISPLAY = branding.company.phoneDisplay;
export const COMPANY_PHONE_TEL = branding.company.phoneTel;
export const COMPANY_EMAIL = branding.company.email;
export const OFFICE_ADDRESS = branding.company.address;
export const OFFICE_MAP_LINK = branding.company.mapLink;
export const SERVICE_HOURS = branding.company.hours;
export const GOOGLE_REVIEW_LINK = branding.company.googleReviewLink;
export const LOGO_URL = branding.company.logoUrl;
export const APP_URL = branding.company.appUrl;

// --- Service area ---
export const SERVICE_AREA = branding.serviceArea.summary;
export const LOCAL_SERVICE_CITIES = branding.serviceArea.localCities;
export const SURROUNDING_SERVICE_CITIES = branding.serviceArea.surroundingCities;
export const LOCAL_AREA_SHORT_LABEL = branding.serviceArea.localAreaShortLabel;

// --- Copy / marketing strings ---
export const COPY = branding.copy;

// --- Pricing ---
export const OUT_OF_AREA_MINIMUM_FARE = branding.pricing.outOfAreaMinimumFare;
export const OUT_OF_AREA_ENTRY_FEE = branding.pricing.outOfAreaEntryFee;
export const FARE_CONFIG = branding.pricing.fare;
export const PROMO_CODES = branding.pricing.promo;
export const SUBSCRIPTION_TRIAL_DAYS = branding.pricing.subscriptionTrialDays;

function withAnnual(tier) {
  return {
    ...tier,
    annualPrice: parseFloat((tier.monthlyPrice * 11).toFixed(2)),
  };
}
export const SUBSCRIPTION_TIERS = {
  BASIC: withAnnual(branding.pricing.tiers.BASIC),
  PREMIUM: withAnnual(branding.pricing.tiers.PREMIUM),
};

// --- Infrastructure ---
export const STRIPE_PUBLISHABLE_KEY = branding.infrastructure.stripePublishableKey;
export const FIREBASE_CONFIG = branding.infrastructure.firebase;

// --- Policies ---
export const DATA_RETENTION_DAYS = branding.policies.dataRetentionDays;
export const MVR_LOOKBACK_YEARS = branding.policies.mvrLookbackYears;
