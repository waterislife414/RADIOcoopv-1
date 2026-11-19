/** Fallback promos (mirrors supabase seed). Live list comes from the `promos` table. */
export type PromoScope = 'any' | 'mobile' | 'shop';
export type DiscountType = 'fixed' | 'percent' | 'freebie';

export type Promo = {
  code: string;
  title: string;
  description: string | null;
  discount_type: DiscountType;
  amount_cents: number;
  percent_off: number;
  scope: PromoScope;
  service_id: string | null;
  first_time_only: boolean;
  featured: boolean;
};

export const FALLBACK_PROMOS: readonly Promo[] = [
  { code: 'FIRSTMOBILE25', title: '$25 Off First Mobile Repair', description: 'New customers: $25 off any mobile repair over $150.', discount_type: 'fixed', amount_cents: 2500, percent_off: 0, scope: 'mobile', service_id: null, first_time_only: true, featured: true },
  { code: 'BATTERYCHECK', title: 'Free Battery & Alternator Check w/ Oil Change', description: 'Load-tested battery + charging system check with any oil service.', discount_type: 'freebie', amount_cents: 0, percent_off: 0, scope: 'any', service_id: 'oil-change', first_time_only: false, featured: true },
  { code: 'DIAGWAIVED', title: 'Diagnostic Fee Waived w/ Repair', description: 'Approve the repair and the $89 diagnostic fee comes off your bill.', discount_type: 'freebie', amount_cents: 0, percent_off: 0, scope: 'any', service_id: null, first_time_only: false, featured: true },
  { code: 'TRUCK25', title: '$25 Off — You Spotted Our Truck', description: 'Scanned the tailgate QR? $25 off any repair over $150.', discount_type: 'fixed', amount_cents: 2500, percent_off: 0, scope: 'any', service_id: null, first_time_only: false, featured: false },
];
