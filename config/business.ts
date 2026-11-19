/**
 * Single source of truth for business identity.
 * Rates here are DEFAULTS — live values come from `business_settings` (editable in /admin/settings).
 */

/**
 * EXACT SPELLING — DO NOT AUTOCORRECT.
 * The mailbox is "dubios" (not "dubois"). Used verbatim for mailto:, invoices, receipts and Resend reply_to.
 */
export const BUSINESS_EMAIL = 'kyledubios2412@gmail.com' as const;

/** false → "Phenix City, AL 36869 — Exact bay address sent upon booking confirmation". */
export const SHOW_EXACT_SHOP_ADDRESS = false;

export const BUSINESS = {
  name: "Kyle's Auto & Mobile Repair",
  shortName: "Kyle's Auto",
  owner: { name: 'Kyle Dubois', title: 'Owner / Lead Technician' },
  email: BUSINESS_EMAIL,
  phone: { display: '(334) 555-5555', e164: '+13345555555' },
  address: {
    street: '[Street #] The Lane',
    city: 'Phenix City',
    region: 'AL',
    postalCode: '36869',
    country: 'US',
  },
  /** Approximate 36869 centroid. Replace with the shop's exact coordinates for Maps/JSON-LD. */
  geo: { lat: 32.4304, lng: -85.0502 },
  timeZone: 'America/New_York',
  timeZoneLabel: 'ET',
  hours: {
    days: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const,
    open: '07:00',
    close: '18:00',
    display: 'Mon–Sat 7:00 AM – 6:00 PM ET',
    emergency: 'Emergency Mobile Available',
  },
  defaultRates: {
    diagnosticFeeCents: 8900,
    mobileCalloutFeeCents: 4500,
    shopLaborRateCents: 11000,
    bookingDepositCents: 8900,
  },
  warranty: {
    months: 12,
    miles: 12000,
    display: '12-Month / 12,000-Mile Parts & Labor Warranty',
    terms:
      'Parts and labor supplied by Kyle\'s Auto & Mobile Repair are warranted against defects in materials and workmanship for 12 months or 12,000 miles, whichever comes first, from the invoice date. Customer-supplied parts, wear items damaged by misuse, collision, neglect, or repairs altered by another shop are excluded. Keep this receipt — it is your warranty record.',
  },
  googleReviewUrl: 'https://g.page/r/YOUR_LINK/review',
  areaServed: [
    { name: 'Phenix City', region: 'AL' },
    { name: 'Smiths Station', region: 'AL' },
    { name: 'Ladonia', region: 'AL' },
    { name: 'Columbus', region: 'GA' },
    { name: 'Fort Benning', region: 'GA' },
  ],
  priceRange: '$$',
} as const;

export type BusinessRates = {
  diagnosticFeeCents: number;
  mobileCalloutFeeCents: number;
  shopLaborRateCents: number;
  bookingDepositCents: number;
  mobileCapacityPerWindow: number;
  shopCapacityPerWindow: number;
};

export const DEFAULT_RATES: BusinessRates = {
  ...BUSINESS.defaultRates,
  mobileCapacityPerWindow: 1,
  shopCapacityPerWindow: 2,
};

/** Address string respecting SHOW_EXACT_SHOP_ADDRESS. */
export function publicShopAddress(): { line: string; note: string | null } {
  const { street, city, region, postalCode } = BUSINESS.address;
  if (SHOW_EXACT_SHOP_ADDRESS) return { line: `${street}, ${city}, ${region} ${postalCode}`, note: null };
  return {
    line: `${city}, ${region} ${postalCode}`,
    note: 'Exact bay address sent upon booking confirmation',
  };
}

/** Full address — only for confirmed-booking emails and invoices/receipts. */
export function fullShopAddress(): string {
  const { street, city, region, postalCode } = BUSINESS.address;
  return `${street}, ${city}, ${region} ${postalCode}`;
}

export const telHref = `tel:${BUSINESS.phone.e164}`;
export const smsHref = `sms:${BUSINESS.phone.e164}`;
export const mailtoHref = (subject?: string) =>
  `mailto:${BUSINESS_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
