'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BUSINESS } from '@/config/business';
import { requireAdmin } from '@/lib/auth';
import { vehicleLabel } from '@/lib/bookings';
import { BOOKING_FLOW, type BookingRow, type BookingStatus, type CustomerRow, type InvoiceRow, type PromoRow, type TaxPresetRow, type VehicleRow } from '@/lib/db/types';
import { estimateEmail } from '@/lib/email-templates';
import { sendEmail } from '@/lib/email';
import { absoluteUrl } from '@/lib/env';
import { invoiceToken } from '@/lib/ids';
import { computeTotals, lineTotalCents, type LineInput } from '@/lib/invoice-math';
import { dollarsToCents, percentToPpm } from '@/lib/money';
import { BUCKETS } from '@/lib/supabase/admin';
import { VIN_RE } from '@/lib/validation';

// ---------------------------------------------------------------- bookings

const BOOKING_STATUSES = ['new', 'estimate_sent', 'approved', 'in_progress', 'completed', 'paid', 'cancelled'] as const;

export async function advanceBooking(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const { data } = await supabase.from('bookings').select('status').eq('id', id).single();
  const current = (data as { status: BookingStatus } | null)?.status;
  const idx = current ? BOOKING_FLOW.indexOf(current) : -1;
  if (idx >= 0 && idx < BOOKING_FLOW.length - 1) {
    await supabase.from('bookings').update({ status: BOOKING_FLOW[idx + 1] }).eq('id', id);
  }
  revalidatePath('/admin');
  revalidatePath(`/admin/jobs/${id}`);
}

export async function setBookingStatus(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const status = z.enum(BOOKING_STATUSES).parse(formData.get('status'));
  await supabase.from('bookings').update({ status }).eq('id', id);
  revalidatePath('/admin');
  revalidatePath(`/admin/jobs/${id}`);
}

export async function saveBookingNotes(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  await supabase.from('bookings').update({ admin_notes: String(formData.get('admin_notes') ?? '').slice(0, 4000) || null }).eq('id', id);
  revalidatePath(`/admin/jobs/${id}`);
}

export async function createInvoiceFromBooking(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const bookingId = String(formData.get('bookingId'));
  const { data: b } = await supabase.from('bookings').select('*, vehicle:vehicles(*)').eq('id', bookingId).single();
  if (!b) throw new Error('Booking not found');
  const booking = b as BookingRow & { vehicle: VehicleRow | null };

  const { data: presets } = await supabase.from('tax_presets').select('*').eq('active', true);
  const list = (presets ?? []) as TaxPresetRow[];
  const preset =
    (booking.mode === 'mobile' && booking.service_state === 'GA' ? list.find((p) => p.state === 'GA') : undefined) ??
    list.find((p) => p.is_default) ??
    list[0];

  const { data: settings } = await supabase.from('business_settings').select('*').eq('id', 1).single();
  const s = settings as { mobile_callout_fee_cents: number; diagnostic_fee_cents: number } | null;
  const lines: LineInput[] = [];
  if (booking.mode === 'mobile') lines.push({ type: 'fee', description: 'Mobile callout fee', quantity: 1, unitPriceCents: s?.mobile_callout_fee_cents ?? 4500, taxable: preset?.fees_taxable ?? false });
  if (booking.service_ids.includes('diagnostics')) lines.push({ type: 'fee', description: 'Diagnostic fee (waived with approved repair)', quantity: 1, unitPriceCents: s?.diagnostic_fee_cents ?? 8900, taxable: preset?.fees_taxable ?? false });
  if (booking.promo_code) {
    const { data: promo } = await supabase.from('promos').select('*').eq('code', booking.promo_code).maybeSingle();
    const p = promo as PromoRow | null;
    if (p?.discount_type === 'fixed' && p.amount_cents > 0) lines.push({ type: 'discount', description: `Promo ${p.code} — ${p.title}`, quantity: 1, unitPriceCents: p.amount_cents, taxable: false });
  }
  const totals = computeTotals(lines, preset?.rate_ppm ?? 0);

  const { data: inv, error } = await supabase
    .from('invoices')
    .insert({
      token: invoiceToken(),
      booking_id: booking.id,
      customer_id: booking.customer_id,
      vehicle_id: booking.vehicle_id,
      mode: booking.mode,
      status: 'draft',
      tax_preset_id: preset?.id ?? null,
      tax_name: preset?.name ?? '',
      tax_rate_ppm: preset?.rate_ppm ?? 0,
      ...totalsToRow(totals),
      deposit_applied_cents: booking.deposit_status === 'paid' ? booking.deposit_paid_cents : 0,
      odometer: booking.vehicle?.mileage ?? null,
      warranty_terms: BUSINESS.warranty.terms,
    })
    .select('id')
    .single();
  if (error || !inv) throw error ?? new Error('Invoice insert failed');
  const invoiceId = (inv as { id: string }).id;
  if (lines.length) await supabase.from('invoice_items').insert(lines.map((l, i) => itemRow(invoiceId, l, i)));
  redirect(`/admin/invoices/${invoiceId}`);
}

// ---------------------------------------------------------------- invoices

function totalsToRow(t: ReturnType<typeof computeTotals>) {
  return {
    parts_cents: t.partsCents,
    labor_cents: t.laborCents,
    fees_cents: t.feesCents,
    supplies_cents: t.suppliesCents,
    discount_cents: t.discountCents,
    subtotal_cents: t.subtotalCents,
    taxable_cents: t.taxableCents,
    tax_cents: t.taxCents,
    total_cents: t.totalCents,
  };
}

function itemRow(invoiceId: string, l: LineInput, sort: number) {
  return {
    invoice_id: invoiceId,
    sort,
    type: l.type,
    description: l.description,
    quantity: l.quantity,
    unit_price_cents: Math.abs(l.unitPriceCents),
    taxable: l.taxable,
    line_total_cents: lineTotalCents(l),
  };
}

const lineSchema = z.object({
  type: z.enum(['part', 'labor', 'fee', 'supply', 'discount']),
  description: z.string().trim().min(1, 'Every line needs a description.').max(300),
  quantity: z.number().positive().max(10000).transform((n) => Math.round(n * 100) / 100),
  unitPriceCents: z.number().int().min(0).max(10_000_000),
  taxable: z.boolean(),
});

const invoiceSchema = z.object({
  id: z.uuid().nullable(),
  bookingId: z.uuid().nullable(),
  customerId: z.uuid().nullable(),
  vehicleId: z.uuid().nullable(),
  mode: z.enum(['mobile', 'shop']),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.union([z.email(), z.literal('')]).transform((s) => s.toLowerCase()),
    phone: z.string().trim().max(30),
  }),
  vehicle: z.object({
    year: z.number().int().min(1950).max(2100).nullable(),
    make: z.string().trim().max(40),
    model: z.string().trim().max(60),
    engine: z.string().trim().max(60),
    vin: z.string().trim().toUpperCase().refine((v) => v === '' || VIN_RE.test(v), 'VIN must be 17 characters.'),
  }),
  odometer: z.number().int().min(0).max(2_000_000).nullable(),
  taxPresetId: z.uuid(),
  notes: z.string().max(4000),
  depositAppliedCents: z.number().int().min(0),
  lines: z.array(lineSchema).max(100),
});

export type InvoicePayload = z.input<typeof invoiceSchema>;
export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveInvoice(payload: InvoicePayload): Promise<SaveResult> {
  const { supabase } = await requireAdmin();
  const parsed = invoiceSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid invoice.' };
  const p = parsed.data;

  const { data: presetRow } = await supabase.from('tax_presets').select('*').eq('id', p.taxPresetId).single();
  const preset = presetRow as TaxPresetRow | null;
  if (!preset) return { ok: false, error: 'Pick a tax jurisdiction.' };

  // customer
  let customerId = p.customerId;
  const custFields = { full_name: p.customer.name, email: p.customer.email || null, phone: p.customer.phone || null };
  if (customerId) {
    await supabase.from('customers').update(custFields).eq('id', customerId);
  } else {
    const existing = p.customer.email ? await supabase.from('customers').select('id').eq('email', p.customer.email).maybeSingle() : { data: null };
    if (existing.data) {
      customerId = (existing.data as { id: string }).id;
      await supabase.from('customers').update(custFields).eq('id', customerId);
    } else {
      const { data, error } = await supabase.from('customers').insert(custFields).select('id').single();
      if (error || !data) return { ok: false, error: 'Could not save customer.' };
      customerId = (data as { id: string }).id;
    }
  }

  // vehicle
  let vehicleId = p.vehicleId;
  if (p.vehicle.make && p.vehicle.model) {
    const vFields = { customer_id: customerId, year: p.vehicle.year, make: p.vehicle.make, model: p.vehicle.model, engine: p.vehicle.engine || null, vin: p.vehicle.vin || null, mileage: p.odometer };
    if (vehicleId) await supabase.from('vehicles').update(vFields).eq('id', vehicleId);
    else {
      const { data } = await supabase.from('vehicles').insert(vFields).select('id').single();
      vehicleId = (data as { id: string } | null)?.id ?? null;
    }
  }

  const totals = computeTotals(p.lines, preset.rate_ppm);
  const row = {
    customer_id: customerId,
    vehicle_id: vehicleId,
    booking_id: p.bookingId,
    mode: p.mode,
    tax_preset_id: preset.id,
    tax_name: preset.name,
    tax_rate_ppm: preset.rate_ppm,
    ...totalsToRow(totals),
    deposit_applied_cents: p.depositAppliedCents,
    odometer: p.odometer,
    notes: p.notes || null,
  };

  let id = p.id;
  if (id) {
    const { data: cur } = await supabase.from('invoices').select('status, total_cents').eq('id', id).single();
    const current = cur as Pick<InvoiceRow, 'status' | 'total_cents'> | null;
    if (!current) return { ok: false, error: 'Invoice not found.' };
    if (current.status === 'paid' || current.status === 'void') return { ok: false, error: `A ${current.status} invoice can’t be edited.` };
    // Changing an approved estimate invalidates the customer's approval.
    const reapprove = current.status === 'approved' && current.total_cents !== totals.totalCents;
    const { error } = await supabase
      .from('invoices')
      .update({ ...row, ...(reapprove ? { status: 'sent', approved_at: null, approved_signature: null, approved_ip: null, approved_user_agent: null } : {}) })
      .eq('id', id);
    if (error) return { ok: false, error: 'Could not save invoice.' };
    await supabase.from('invoice_items').delete().eq('invoice_id', id);
  } else {
    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...row, token: invoiceToken(), status: 'draft', warranty_terms: BUSINESS.warranty.terms })
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: 'Could not create invoice.' };
    id = (data as { id: string }).id;
  }
  if (p.lines.length) {
    const { error } = await supabase.from('invoice_items').insert(p.lines.map((l, i) => itemRow(id!, l, i)));
    if (error) return { ok: false, error: 'Could not save line items.' };
  }
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath('/admin/invoices');
  return { ok: true, id };
}

export async function sendInvoice(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const { data } = await supabase.from('invoices').select('*, customer:customers(*), vehicle:vehicles(*)').eq('id', id).single();
  const inv = data as (InvoiceRow & { customer: CustomerRow | null; vehicle: VehicleRow | null }) | null;
  if (!inv || inv.status === 'paid' || inv.status === 'void') return;
  if (inv.status === 'draft') await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
  if (inv.booking_id) await supabase.from('bookings').update({ status: 'estimate_sent' }).eq('id', inv.booking_id).eq('status', 'new');
  if (inv.customer?.email) {
    const mail = estimateEmail({
      name: inv.customer.full_name,
      number: inv.number ?? '',
      vehicle: vehicleLabel(inv.vehicle),
      totalCents: inv.total_cents,
      url: absoluteUrl(`/invoice/${inv.token}`),
    });
    await sendEmail({ to: inv.customer.email, ...mail });
  }
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath('/admin');
}

export async function markPaidOffline(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const method = z.enum(['cash', 'check', 'card-terminal', 'other']).parse(formData.get('method'));
  const { data } = await supabase.from('invoices').select('*').eq('id', id).single();
  const inv = data as InvoiceRow | null;
  if (!inv || inv.status === 'paid' || inv.status === 'void') return;
  const due = Math.max(0, inv.total_cents - inv.deposit_applied_cents - inv.amount_paid_cents);
  await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString(), amount_paid_cents: inv.amount_paid_cents + due, stripe_payment_intent_id: `offline:${method}` })
    .eq('id', id);
  if (inv.booking_id) await supabase.from('bookings').update({ status: 'paid' }).eq('id', inv.booking_id);
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath('/admin');
}

export async function voidInvoice(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  await supabase.from('invoices').update({ status: 'void' }).eq('id', id).neq('status', 'paid');
  revalidatePath(`/admin/invoices/${id}`);
}

// ---------------------------------------------------------------- DVI photos

const dviSchema = z.object({
  bookingId: z.uuid().nullable(),
  invoiceId: z.uuid().nullable(),
  path: z.string().min(3).max(300),
  rating: z.enum(['green', 'yellow', 'red']),
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(400),
});

export async function addInspectionPhoto(input: z.input<typeof dviSchema>): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAdmin();
  const p = dviSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  if (!p.data.bookingId && !p.data.invoiceId) return { ok: false, error: 'Missing job.' };
  const { error } = await supabase.from('inspection_photos').insert({
    booking_id: p.data.bookingId,
    invoice_id: p.data.invoiceId,
    storage_path: p.data.path,
    rating: p.data.rating,
    title: p.data.title,
    caption: p.data.caption || null,
  });
  if (error) return { ok: false, error: error.message };
  if (p.data.bookingId) revalidatePath(`/admin/jobs/${p.data.bookingId}`);
  if (p.data.invoiceId) revalidatePath(`/admin/invoices/${p.data.invoiceId}`);
  return { ok: true };
}

export async function deleteInspectionPhoto(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const { data } = await supabase.from('inspection_photos').select('storage_path, booking_id, invoice_id').eq('id', id).single();
  const row = data as { storage_path: string; booking_id: string | null; invoice_id: string | null } | null;
  if (!row) return;
  await supabase.storage.from(BUCKETS.inspectionPhotos).remove([row.storage_path]);
  await supabase.from('inspection_photos').delete().eq('id', id);
  if (row.booking_id) revalidatePath(`/admin/jobs/${row.booking_id}`);
  if (row.invoice_id) revalidatePath(`/admin/invoices/${row.invoice_id}`);
}

// ---------------------------------------------------------------- settings

const cents = (v: FormDataEntryValue | null) => {
  const c = dollarsToCents(String(v ?? ''));
  if (c === null || c < 0) throw new Error('Invalid amount');
  return c;
};

export async function updateRates(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  await supabase
    .from('business_settings')
    .update({
      diagnostic_fee_cents: cents(formData.get('diagnostic')),
      mobile_callout_fee_cents: cents(formData.get('callout')),
      shop_labor_rate_cents: cents(formData.get('labor')),
      booking_deposit_cents: cents(formData.get('deposit')),
      mobile_capacity_per_window: z.coerce.number().int().min(0).max(20).parse(formData.get('mobileCap')),
      shop_capacity_per_window: z.coerce.number().int().min(0).max(20).parse(formData.get('shopCap')),
    })
    .eq('id', 1);
  revalidatePath('/', 'layout');
}

export async function saveTaxPreset(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const name = z.string().trim().min(2).max(120).parse(formData.get('name'));
  const row = {
    name,
    state: z.enum(['AL', 'GA']).parse(formData.get('state')),
    rate_ppm: percentToPpm(z.coerce.number().min(0).max(20).parse(formData.get('ratePercent'))),
    parts_taxable: formData.get('parts_taxable') === 'on',
    labor_taxable: formData.get('labor_taxable') === 'on',
    fees_taxable: formData.get('fees_taxable') === 'on',
    active: formData.get('active') === 'on',
    notes: String(formData.get('notes') ?? '') || null,
  };
  const makeDefault = formData.get('is_default') === 'on';
  if (makeDefault) await supabase.from('tax_presets').update({ is_default: false }).eq('is_default', true);
  if (id) await supabase.from('tax_presets').update({ ...row, ...(makeDefault ? { is_default: true } : {}) }).eq('id', id);
  else {
    const slug = `${row.state.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now().toString(36)}`;
    await supabase.from('tax_presets').insert({ ...row, slug, is_default: makeDefault });
  }
  revalidatePath('/admin/settings');
}

export async function togglePromo(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const field = z.enum(['active', 'featured']).parse(formData.get('field'));
  const value = formData.get('value') === 'true';
  await supabase.from('promos').update({ [field]: value }).eq('id', id);
  revalidatePath('/admin/settings');
  revalidatePath('/');
}

export async function createPromo(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/).parse(formData.get('code'));
  const type = z.enum(['fixed', 'percent', 'freebie']).parse(formData.get('discount_type'));
  await supabase.from('promos').insert({
    code,
    title: z.string().trim().min(3).max(120).parse(formData.get('title')),
    description: String(formData.get('description') ?? '') || null,
    discount_type: type,
    amount_cents: type === 'fixed' ? cents(formData.get('amount')) : 0,
    percent_off: type === 'percent' ? z.coerce.number().int().min(1).max(100).parse(formData.get('percent')) : 0,
    scope: z.enum(['any', 'mobile', 'shop']).parse(formData.get('scope')),
    featured: formData.get('featured') === 'on',
    first_time_only: formData.get('first_time_only') === 'on',
  });
  revalidatePath('/admin/settings');
  revalidatePath('/');
}
