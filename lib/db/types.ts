/**
 * Row types mirroring supabase/schema.sql. Hand-maintained; regenerate with
 * `npx supabase gen types typescript --project-id <id>` if you prefer generated types.
 */
import type { LineType } from '@/lib/invoice-math';
import type { PlanId, Interval } from '@/config/memberships';
import type { DiscountType, PromoScope } from '@/config/promos';

export type ServiceModeDb = 'mobile' | 'shop';
export type BookingStatus = 'new' | 'estimate_sent' | 'approved' | 'in_progress' | 'completed' | 'paid' | 'cancelled';
export type InvoiceStatus = 'draft' | 'sent' | 'approved' | 'paid' | 'void';
export type DviRating = 'green' | 'yellow' | 'red';
export type DepositStatus = 'none' | 'pending' | 'paid' | 'refunded';
export type MembershipStatus =
  | 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';

export const BOOKING_FLOW: readonly BookingStatus[] = ['new', 'estimate_sent', 'approved', 'in_progress', 'completed', 'paid'];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  new: 'New',
  estimate_sent: 'Estimate Sent',
  approved: 'Approved',
  in_progress: 'In Progress',
  completed: 'Completed',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export type BusinessSettingsRow = {
  id: 1;
  diagnostic_fee_cents: number;
  mobile_callout_fee_cents: number;
  shop_labor_rate_cents: number;
  booking_deposit_cents: number;
  mobile_capacity_per_window: number;
  shop_capacity_per_window: number;
  updated_at: string;
};

export type TaxPresetRow = {
  id: string;
  slug: string;
  name: string;
  state: 'AL' | 'GA';
  rate_ppm: number;
  parts_taxable: boolean;
  labor_taxable: boolean;
  fees_taxable: boolean;
  is_default: boolean;
  active: boolean;
  notes: string | null;
};

export type CustomerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  stripe_customer_id: string | null;
  notes: string | null;
  created_at: string;
};

export type VehicleRow = {
  id: string;
  customer_id: string;
  year: number | null;
  make: string;
  model: string;
  engine: string | null;
  vin: string | null;
  mileage: number | null;
};

export type PromoRow = {
  id: string;
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
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  redemptions: number;
  sort: number;
};

export type BookingRow = {
  id: string;
  ref: string;
  mode: ServiceModeDb;
  status: BookingStatus;
  customer_id: string;
  vehicle_id: string | null;
  service_ids: string[];
  symptoms: string | null;
  media_paths: string[];
  service_street: string | null;
  service_city: string | null;
  service_state: string | null;
  service_zip: string | null;
  parking_notes: string | null;
  after_hours_key_drop: boolean;
  scheduled_date: string;
  window_id: string;
  window_label: string;
  scheduled_start: string;
  scheduled_end: string;
  promo_code: string | null;
  payment_choice: 'deposit' | 'estimate';
  deposit_status: DepositStatus;
  deposit_cents: number;
  deposit_paid_cents: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingWithRelations = BookingRow & {
  customer: CustomerRow | null;
  vehicle: VehicleRow | null;
};

export type InvoiceRow = {
  id: string;
  number: string | null;
  token: string;
  booking_id: string | null;
  customer_id: string;
  vehicle_id: string | null;
  mode: ServiceModeDb;
  status: InvoiceStatus;
  tax_preset_id: string | null;
  tax_name: string;
  tax_rate_ppm: number;
  parts_cents: number;
  labor_cents: number;
  fees_cents: number;
  supplies_cents: number;
  discount_cents: number;
  subtotal_cents: number;
  taxable_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_applied_cents: number;
  amount_paid_cents: number;
  odometer: number | null;
  notes: string | null;
  warranty_terms: string | null;
  sent_at: string | null;
  approved_at: string | null;
  approved_signature: string | null;
  approved_ip: string | null;
  approved_user_agent: string | null;
  paid_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  sort: number;
  type: LineType;
  description: string;
  quantity: number;
  unit_price_cents: number;
  taxable: boolean;
  line_total_cents: number;
};

export type InvoiceWithRelations = InvoiceRow & {
  customer: CustomerRow | null;
  vehicle: VehicleRow | null;
  items: InvoiceItemRow[];
};

export type InspectionPhotoRow = {
  id: string;
  booking_id: string | null;
  invoice_id: string | null;
  storage_path: string;
  rating: DviRating;
  title: string;
  caption: string | null;
  sort: number;
  created_at: string;
};

export type MembershipRow = {
  id: string;
  customer_id: string | null;
  plan: PlanId;
  interval: Interval;
  status: MembershipStatus;
  vehicles_allowed: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  unit_amount_cents: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  oil_changes_used: number;
  callouts_waived_used: number;
  created_at: string;
};

/** PostgREST returns numeric as string in some configs — normalize. */
export function normalizeItem(i: InvoiceItemRow): InvoiceItemRow {
  return { ...i, quantity: Number(i.quantity) };
}
