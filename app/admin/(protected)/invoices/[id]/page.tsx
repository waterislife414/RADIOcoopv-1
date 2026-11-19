/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Send } from 'lucide-react';
import { BUSINESS } from '@/config/business';
import { DviUploader } from '@/components/admin/DviUploader';
import { InvoiceBuilder, type BuilderInitial } from '@/components/admin/InvoiceBuilder';
import { SharePanel } from '@/components/admin/SharePanel';
import { requireAdmin } from '@/lib/auth';
import { vehicleLabel } from '@/lib/bookings';
import { rowToRates } from '@/lib/db/settings';
import type { BusinessSettingsRow, TaxPresetRow } from '@/lib/db/types';
import { absoluteUrl } from '@/lib/env';
import { INVOICE_SELECT, getSignedInspectionPhotos, normalizeInvoice } from '@/lib/invoices';
import { formatET } from '@/lib/time';
import { deleteInspectionPhoto, markPaidOffline, sendInvoice, voidInvoice } from '../../actions';

export default async function InvoiceAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const [{ data }, { data: presets }, { data: settings }] = await Promise.all([
    supabase.from('invoices').select(INVOICE_SELECT).eq('id', id).maybeSingle(),
    supabase.from('tax_presets').select('*').eq('active', true).order('is_default', { ascending: false }),
    supabase.from('business_settings').select('*').eq('id', 1).single(),
  ]);
  if (!data) notFound();
  const inv = normalizeInvoice(data);
  const rates = rowToRates(settings as BusinessSettingsRow);
  const photos = await getSignedInspectionPhotos({ invoiceId: inv.id, bookingId: inv.booking_id }, supabase);
  const url = absoluteUrl(`/invoice/${inv.token}`);
  const first = inv.customer?.full_name.split(' ')[0] ?? '';
  const smsText = `Hi ${first}, it's Kyle with ${BUSINESS.name}. Your ${inv.status === 'paid' ? 'receipt' : 'estimate'} for the ${vehicleLabel(inv.vehicle)} is ready: ${url} — review the photos and tap Approve. Questions? Reply here or call ${BUSINESS.phone.display}.`;

  const initial: BuilderInitial = {
    id: inv.id,
    bookingId: inv.booking_id,
    customerId: inv.customer_id,
    vehicleId: inv.vehicle_id,
    mode: inv.mode,
    customer: { name: inv.customer?.full_name ?? '', email: inv.customer?.email ?? '', phone: inv.customer?.phone ?? '' },
    vehicle: {
      year: inv.vehicle?.year ? String(inv.vehicle.year) : '',
      make: inv.vehicle?.make ?? '',
      model: inv.vehicle?.model ?? '',
      engine: inv.vehicle?.engine ?? '',
      vin: inv.vehicle?.vin ?? '',
    },
    odometer: inv.odometer != null ? String(inv.odometer) : '',
    taxPresetId: inv.tax_preset_id ?? '',
    notes: inv.notes ?? '',
    depositAppliedCents: inv.deposit_applied_cents,
    lines: inv.items.map((i) => ({ type: i.type, description: i.description, quantity: i.quantity, unitPriceCents: i.unit_price_cents, taxable: i.taxable })),
    locked: inv.status === 'paid' || inv.status === 'void',
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl">{inv.number}</h1>
            <p className="text-sm text-slate-600">
              Status <strong className="capitalize">{inv.status}</strong>
              {inv.approved_at && ` · approved ${formatET(inv.approved_at)} as “${inv.approved_signature}”`}
              {inv.paid_at && ` · paid ${formatET(inv.paid_at)}`}
            </p>
          </div>
          {inv.booking_id && <Link href={`/admin/jobs/${inv.booking_id}`} className="text-sm font-bold underline">Open job</Link>}
        </div>
        <InvoiceBuilder initial={initial} presets={(presets ?? []) as TaxPresetRow[]} rates={{ laborCents: rates.shopLaborRateCents, calloutCents: rates.mobileCalloutFeeCents, diagnosticCents: rates.diagnosticFeeCents }} />
      </div>

      <aside className="space-y-4">
        <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
          {(inv.status === 'draft' || inv.status === 'sent' || inv.status === 'approved') && (
            <form action={sendInvoice}>
              <input type="hidden" name="id" value={inv.id} />
              <button className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 font-extrabold text-white">
                <Send className="h-4 w-4" aria-hidden /> {inv.status === 'draft' ? 'Send estimate to customer' : 'Re-send link by email'}
              </button>
            </form>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center gap-1 rounded-lg bg-slate-100 text-sm font-bold">
            <ExternalLink className="h-4 w-4" aria-hidden /> Preview customer view
          </a>
          {inv.status === 'approved' && (
            <form action={markPaidOffline} className="flex gap-2">
              <input type="hidden" name="id" value={inv.id} />
              <select name="method" className="h-10 flex-1 rounded-lg border border-slate-300 px-2 text-sm">
                <option value="cash">Cash</option><option value="check">Check</option><option value="card-terminal">Card terminal</option><option value="other">Other</option>
              </select>
              <button className="h-10 rounded-lg bg-emerald-500 px-3 text-sm font-bold text-white">Mark paid</button>
            </form>
          )}
          {inv.status !== 'paid' && inv.status !== 'void' && (
            <form action={voidInvoice}>
              <input type="hidden" name="id" value={inv.id} />
              <button className="h-9 w-full rounded-lg text-xs font-bold text-red-600 hover:bg-red-50">Void invoice</button>
            </form>
          )}
        </div>
        {inv.status !== 'draft' && <SharePanel url={url} smsText={smsText} phone={inv.customer?.phone ?? null} number={inv.number ?? ''} />}
        <DviUploader bookingId={inv.booking_id} invoiceId={inv.id} />
        {photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <li key={p.id} className="relative">
                {p.url && <img src={p.url} alt={p.title} className="aspect-square w-full rounded object-cover" />}
                <span className={`absolute left-1 top-1 h-3 w-3 rounded-full ${p.rating === 'red' ? 'bg-red-600' : p.rating === 'yellow' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                <form action={deleteInspectionPhoto} className="absolute right-1 top-1"><input type="hidden" name="id" value={p.id} /><button className="rounded bg-white/90 px-1 text-xs font-bold text-red-600" aria-label="Delete">×</button></form>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
