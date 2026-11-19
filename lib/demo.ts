import 'server-only';
import { cookies } from 'next/headers';
import { BUSINESS } from '@/config/business';
import type { BookingWithRelations, InvoiceItemRow, InvoiceStatus, InvoiceWithRelations } from '@/lib/db/types';
import { computeTotals, lineTotalCents, type LineInput } from '@/lib/invoice-math';
import type { SignedPhoto } from '@/lib/invoices';

/**
 * DEMO MODE (NEXT_PUBLIC_DEMO_MODE=1): the whole public site runs with no Supabase/Stripe/Resend keys.
 * State lives in short-lived cookies so it survives serverless instance hops. Used for the client
 * preview link and for the QA click-through in CI. Never enable in production.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === '1';
export const DEMO_INVOICE_TOKEN = 'demo-estimate-kyles-auto-0001';

const BOOKING_COOKIE = 'demo_booking';
const INVOICE_COOKIE = 'demo_invoice';
const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 };

const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const dec = <T>(v: string | undefined): T | null => {
  if (!v) return null;
  try {
    return JSON.parse(Buffer.from(v, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
};

export async function demoSaveBooking(b: BookingWithRelations): Promise<void> {
  (await cookies()).set(BOOKING_COOKIE, enc(b), cookieOpts);
}

export async function demoGetBooking(ref: string): Promise<BookingWithRelations | null> {
  const b = dec<BookingWithRelations>((await cookies()).get(BOOKING_COOKIE)?.value);
  return b && b.ref === ref ? b : null;
}

type InvoiceState = { status: InvoiceStatus; approved_signature?: string; approved_at?: string; paid_at?: string };

export async function demoSetInvoice(patch: InvoiceState): Promise<void> {
  const jar = await cookies();
  const cur = dec<InvoiceState>(jar.get(INVOICE_COOKIE)?.value) ?? { status: 'sent' };
  jar.set(INVOICE_COOKIE, enc({ ...cur, ...patch }), cookieOpts);
}

const LINES: LineInput[] = [
  { type: 'labor', description: 'Alternator remove & replace', quantity: 1.5, unitPriceCents: 11000, taxable: false },
  { type: 'labor', description: 'Charging system output test', quantity: 0.3, unitPriceCents: 11000, taxable: false },
  { type: 'part', description: 'Alternator, remanufactured (OE-spec, lifetime core)', quantity: 1, unitPriceCents: 21999, taxable: true },
  { type: 'part', description: 'Serpentine belt', quantity: 1, unitPriceCents: 4299, taxable: true },
  { type: 'supply', description: 'Shop supplies', quantity: 1, unitPriceCents: 1200, taxable: true },
  { type: 'fee', description: 'Mobile callout fee', quantity: 1, unitPriceCents: 4500, taxable: false },
  { type: 'fee', description: 'Diagnostic fee', quantity: 1, unitPriceCents: 8900, taxable: false },
  { type: 'discount', description: 'Diagnostic fee waived with approved repair', quantity: 1, unitPriceCents: 8900, taxable: false },
  { type: 'discount', description: 'Promo FIRSTMOBILE25', quantity: 1, unitPriceCents: 2500, taxable: false },
];
const RATE_PPM = 97500;

export async function demoInvoice(): Promise<InvoiceWithRelations> {
  const st = dec<InvoiceState>((await cookies()).get(INVOICE_COOKIE)?.value) ?? { status: 'sent' as const };
  const t = computeTotals(LINES, RATE_PPM);
  const now = new Date().toISOString();
  const items: InvoiceItemRow[] = LINES.map((l, i) => ({
    id: `demo-item-${i}`, invoice_id: 'demo', sort: i, type: l.type, description: l.description, quantity: l.quantity,
    unit_price_cents: l.unitPriceCents, taxable: l.taxable, line_total_cents: lineTotalCents(l),
  }));
  const paid = st.status === 'paid';
  return {
    id: '00000000-0000-4000-8000-000000000001', number: 'INV-2026-01042', token: DEMO_INVOICE_TOKEN, booking_id: null,
    customer_id: 'demo', vehicle_id: 'demo', mode: 'mobile', status: st.status,
    tax_preset_id: null, tax_name: 'Alabama — Phenix City', tax_rate_ppm: RATE_PPM,
    parts_cents: t.partsCents, labor_cents: t.laborCents, fees_cents: t.feesCents, supplies_cents: t.suppliesCents,
    discount_cents: t.discountCents, subtotal_cents: t.subtotalCents, taxable_cents: t.taxableCents, tax_cents: t.taxCents,
    total_cents: t.totalCents, deposit_applied_cents: 0, amount_paid_cents: paid ? t.totalCents : 0,
    odometer: 128_420, notes: 'Battery light on, voltage at idle 12.1 V. Alternator output failed under load. Belt glazed with cracks — replacing with the alternator. Battery tested good (640 CCA).',
    warranty_terms: BUSINESS.warranty.terms, sent_at: now,
    approved_at: st.approved_at ?? null, approved_signature: st.approved_signature ?? null, approved_ip: null, approved_user_agent: null,
    paid_at: st.paid_at ?? null, stripe_checkout_session_id: null,
    stripe_payment_intent_id: paid ? 'pi_DEMO_not_a_real_charge' : null, stripe_charge_id: paid ? 'ch_DEMO' : null,
    created_at: now, updated_at: now,
    customer: { id: 'demo', full_name: 'Sample Customer', email: 'customer@example.com', phone: '(334) 555-0100', stripe_customer_id: null, notes: null, created_at: now },
    vehicle: { id: 'demo', customer_id: 'demo', year: 2016, make: 'Ford', model: 'F-150', engine: '5.0L V8', vin: '1FTEW1EF0GKD00000', mileage: 128_420 },
    items,
  };
}

function photoSvg(fill: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#1E293B"/><circle cx="200" cy="140" r="80" fill="none" stroke="${fill}" stroke-width="18"/><circle cx="200" cy="140" r="30" fill="${fill}" opacity=".5"/><text x="200" y="270" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function demoPhotos(): SignedPhoto[] {
  const base = { booking_id: null, invoice_id: 'demo', storage_path: 'demo', sort: 0, created_at: new Date().toISOString() };
  return [
    { ...base, id: 'p1', rating: 'red', title: 'Alternator output 12.1 V under load', caption: 'Should be 13.8–14.6 V. Not charging the battery.', url: photoSvg('#DC2626', 'DEMO PHOTO · alternator') },
    { ...base, id: 'p2', rating: 'yellow', title: 'Front brake pads — 4 mm', caption: 'Plan to replace in the next 3,000–5,000 miles.', url: photoSvg('#F59E0B', 'DEMO PHOTO · brake pads') },
    { ...base, id: 'p3', rating: 'green', title: 'Battery 640 CCA — tests good', caption: 'No replacement needed.', url: photoSvg('#10B981', 'DEMO PHOTO · battery') },
  ];
}
