import 'server-only';
import { fullShopAddress } from '@/config/business';
import { WINDOW_BY_ID } from '@/config/scheduling';
import { SERVICE_BY_ID } from '@/config/services';
import { checkCoverage } from '@/config/serviceArea';
import { getRates, validatePromo } from '@/lib/db/settings';
import { DEMO, demoGetBooking, demoSaveBooking } from '@/lib/demo';
import type { BookingRow, CustomerRow, VehicleRow } from '@/lib/db/types';
import { bookingCustomerEmail, bookingOwnerEmail, type BookingEmailData } from '@/lib/email-templates';
import { OWNER_INBOX, sendEmail } from '@/lib/email';
import { absoluteUrl } from '@/lib/env';
import { bookingRef } from '@/lib/ids';
import { createDepositCheckout } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatDateISO, isDateInBookingRange, isWindowBookable, windowRange } from '@/lib/time';
import type { BookingInput } from '@/lib/validation';

export class BookingError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export async function slotUsage(dateISO: string, mode: 'mobile' | 'shop'): Promise<Map<string, number>> {
  if (DEMO) return new Map();
  const { data, error } = await supabaseAdmin()
    .from('bookings')
    .select('window_id')
    .eq('scheduled_date', dateISO)
    .eq('mode', mode)
    .neq('status', 'cancelled');
  if (error) throw error;
  const usage = new Map<string, number>();
  for (const r of (data ?? []) as { window_id: string }[]) usage.set(r.window_id, (usage.get(r.window_id) ?? 0) + 1);
  return usage;
}

async function upsertCustomer(c: BookingInput['contact']): Promise<CustomerRow> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from('customers').select('*').eq('email', c.email).maybeSingle();
  if (existing) {
    const { data, error } = await db
      .from('customers')
      .update({ full_name: c.name, phone: c.phone })
      .eq('id', (existing as CustomerRow).id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CustomerRow;
  }
  const { data, error } = await db.from('customers').insert({ full_name: c.name, email: c.email, phone: c.phone }).select('*').single();
  if (error) throw error;
  return data as CustomerRow;
}

async function upsertVehicle(customerId: string, v: BookingInput['vehicle']): Promise<VehicleRow> {
  const db = supabaseAdmin();
  const fields = {
    customer_id: customerId,
    year: v.year,
    make: v.make,
    model: v.model,
    engine: v.engine || null,
    vin: v.vin || null,
    mileage: v.mileage,
  };
  if (v.vin) {
    const { data: existing } = await db.from('vehicles').select('*').eq('customer_id', customerId).eq('vin', v.vin).maybeSingle();
    if (existing) {
      const { data, error } = await db.from('vehicles').update(fields).eq('id', (existing as VehicleRow).id).select('*').single();
      if (error) throw error;
      return data as VehicleRow;
    }
  }
  const { data, error } = await db.from('vehicles').insert(fields).select('*').single();
  if (error) throw error;
  return data as VehicleRow;
}

export const vehicleLabel = (v: Pick<VehicleRow, 'year' | 'make' | 'model'> | null) =>
  v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : 'Vehicle';

export function bookingEmailData(b: BookingRow, c: CustomerRow, v: VehicleRow | null): BookingEmailData {
  return {
    ref: b.ref,
    customerName: c.full_name,
    customerEmail: c.email ?? '',
    customerPhone: c.phone ?? '',
    mode: b.mode,
    dateLabel: formatDateISO(b.scheduled_date, true),
    windowLabel: b.window_label,
    vehicle: vehicleLabel(v),
    services: b.service_ids.map((id) => SERVICE_BY_ID.get(id)?.name ?? id),
    symptoms: b.symptoms,
    serviceAddress: b.mode === 'mobile' ? `${b.service_street}, ${b.service_city}, ${b.service_state} ${b.service_zip}` : null,
    parkingNotes: b.parking_notes,
    afterHoursKeyDrop: b.after_hours_key_drop,
    shopAddress: fullShopAddress(),
    paymentChoice: b.payment_choice,
    depositCents: b.deposit_cents,
    promoCode: b.promo_code,
    mediaCount: b.media_paths.length,
    utmSource: b.utm_source,
    confirmationUrl: absoluteUrl(`/book/confirmation/${b.ref}`),
    icsUrl: absoluteUrl(`/api/bookings/${b.ref}/ics`),
    adminUrl: absoluteUrl(`/admin/jobs/${b.id}`),
  };
}

export async function createBooking(input: BookingInput): Promise<{ ref: string; checkoutUrl: string | null }> {
  const rates = await getRates();

  if (input.mode === 'mobile') {
    const cov = checkCoverage(input.address!.zip, rates.mobileCalloutFeeCents);
    if (cov.status !== 'mobile') {
      throw new BookingError(422, 'OUT_OF_AREA', 'That address is outside our mobile radius — book a Shop Drop-Off instead.', 'address.zip');
    }
  }

  const window = WINDOW_BY_ID.get(input.windowId);
  if (!window) throw new BookingError(422, 'BAD_WINDOW', 'Pick an arrival window.', 'windowId');
  if (!isDateInBookingRange(input.date) || !isWindowBookable(input.date, window)) {
    throw new BookingError(422, 'SLOT_PAST', 'That time is no longer available. Pick another window.', 'windowId');
  }
  const capacity = input.mode === 'mobile' ? rates.mobileCapacityPerWindow : rates.shopCapacityPerWindow;
  const usage = await slotUsage(input.date, input.mode);
  if ((usage.get(window.id) ?? 0) >= capacity) {
    throw new BookingError(409, 'SLOT_FULL', 'That window just filled up. Pick another time.', 'windowId');
  }

  let promoCode: string | null = null;
  if (input.promoCode) {
    const check = await validatePromo(input.promoCode, { mode: input.mode, email: input.contact.email });
    if (!check.ok) throw new BookingError(422, 'PROMO', check.reason, 'promoCode');
    promoCode = check.promo.code;
  }

  if (DEMO) return createDemoBooking(input, window, depositCentsFor(input, rates.bookingDepositCents), promoCode);

  const db = supabaseAdmin();
  const customer = await upsertCustomer(input.contact);
  const vehicle = await upsertVehicle(customer.id, input.vehicle);
  const { start, end } = windowRange(input.date, window);
  const depositCents = depositCentsFor(input, rates.bookingDepositCents);

  const base = {
    mode: input.mode,
    customer_id: customer.id,
    vehicle_id: vehicle.id,
    service_ids: input.serviceIds,
    symptoms: input.symptoms || null,
    media_paths: input.mediaPaths,
    service_street: input.address?.street ?? null,
    service_city: input.address?.city ?? null,
    service_state: input.address?.state ?? null,
    service_zip: input.address?.zip ?? null,
    parking_notes: input.address?.parkingNotes || null,
    after_hours_key_drop: input.mode === 'shop' ? input.afterHoursKeyDrop : false,
    scheduled_date: input.date,
    window_id: window.id,
    window_label: window.label,
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    promo_code: promoCode,
    payment_choice: depositCents > 0 ? 'deposit' : 'estimate',
    deposit_status: depositCents > 0 ? 'pending' : 'none',
    deposit_cents: depositCents,
    utm_source: input.utm.source ?? null,
    utm_medium: input.utm.medium ?? null,
    utm_campaign: input.utm.campaign ?? null,
  };

  let booking: BookingRow | null = null;
  for (let attempt = 0; attempt < 4 && !booking; attempt++) {
    const { data, error } = await db.from('bookings').insert({ ...base, ref: bookingRef() }).select('*').single();
    if (!error) booking = data as BookingRow;
    else if (error.code !== '23505') throw error; // retry only on ref collision
  }
  if (!booking) throw new BookingError(500, 'REF', 'Could not create booking. Please try again.');

  if (promoCode) await db.rpc('increment_promo_redemption', { p_code: promoCode });

  let checkoutUrl: string | null = null;
  if (depositCents > 0) {
    const services = input.serviceIds.map((id) => SERVICE_BY_ID.get(id)?.name ?? id).join(', ') || 'Diagnosis';
    const session = await createDepositCheckout({
      bookingId: booking.id,
      ref: booking.ref,
      amountCents: depositCents,
      email: customer.email ?? input.contact.email,
      summary: `${vehicleLabel(vehicle)} · ${services} · ${formatDateISO(input.date)} ${window.label}`,
    });
    await db.from('bookings').update({ stripe_checkout_session_id: session.id }).eq('id', booking.id);
    checkoutUrl = session.url;
  }

  const emailData = bookingEmailData(booking, customer, vehicle);
  const c = bookingCustomerEmail(emailData);
  const o = bookingOwnerEmail(emailData);
  await Promise.allSettled([
    sendEmail({ to: input.contact.email, ...c }),
    sendEmail({ to: OWNER_INBOX, ...o }),
  ]);

  return { ref: booking.ref, checkoutUrl };
}

const depositCentsFor = (input: BookingInput, deposit: number) => (input.paymentChoice === 'deposit' ? deposit : 0);

async function createDemoBooking(
  input: BookingInput,
  window: { id: string; label: string; start: string; end: string },
  depositCents: number,
  promoCode: string | null,
): Promise<{ ref: string; checkoutUrl: string | null }> {
  const { start, end } = windowRange(input.date, window);
  const now = new Date().toISOString();
  const ref = bookingRef();
  await demoSaveBooking({
    id: '00000000-0000-4000-8000-0000000000b1', ref, mode: input.mode, status: 'new', customer_id: 'demo', vehicle_id: 'demo',
    service_ids: input.serviceIds, symptoms: input.symptoms || null, media_paths: [],
    service_street: input.address?.street ?? null, service_city: input.address?.city ?? null, service_state: input.address?.state ?? null,
    service_zip: input.address?.zip ?? null, parking_notes: input.address?.parkingNotes || null,
    after_hours_key_drop: input.mode === 'shop' ? input.afterHoursKeyDrop : false,
    scheduled_date: input.date, window_id: window.id, window_label: window.label,
    scheduled_start: start.toISOString(), scheduled_end: end.toISOString(), promo_code: promoCode,
    payment_choice: depositCents > 0 ? 'deposit' : 'estimate', deposit_status: depositCents > 0 ? 'paid' : 'none',
    deposit_cents: depositCents, deposit_paid_cents: depositCents, stripe_checkout_session_id: null, stripe_payment_intent_id: null,
    utm_source: input.utm.source ?? null, utm_medium: input.utm.medium ?? null, utm_campaign: input.utm.campaign ?? null,
    admin_notes: null, created_at: now, updated_at: now,
    customer: { id: 'demo', full_name: input.contact.name, email: input.contact.email, phone: input.contact.phone, stripe_customer_id: null, notes: null, created_at: now },
    vehicle: { id: 'demo', customer_id: 'demo', year: input.vehicle.year, make: input.vehicle.make, model: input.vehicle.model, engine: input.vehicle.engine || null, vin: input.vehicle.vin || null, mileage: input.vehicle.mileage },
  });
  return { ref, checkoutUrl: depositCents > 0 ? `/book/confirmation/${ref}?deposit=success` : null };
}

export async function getBookingByRef(ref: string) {
  if (!/^KA-[A-Z0-9]{6,8}$/.test(ref)) return null;
  if (DEMO) return demoGetBooking(ref);
  const { data } = await supabaseAdmin()
    .from('bookings')
    .select('*, customer:customers(*), vehicle:vehicles(*)')
    .eq('ref', ref)
    .maybeSingle();
  return data as (BookingRow & { customer: CustomerRow | null; vehicle: VehicleRow | null }) | null;
}
