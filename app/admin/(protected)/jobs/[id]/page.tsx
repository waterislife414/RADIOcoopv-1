/* eslint-disable @next/next/no-img-element -- signed URLs from private buckets */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, KeyRound, MapPin, MessageSquare, Phone, Trash } from 'lucide-react';
import { SERVICE_BY_ID } from '@/config/services';
import { DviUploader } from '@/components/admin/DviUploader';
import { requireAdmin } from '@/lib/auth';
import { vehicleLabel } from '@/lib/bookings';
import { BOOKING_STATUS_LABEL, type BookingStatus, type BookingWithRelations, type InvoiceRow } from '@/lib/db/types';
import { getSignedInspectionPhotos } from '@/lib/invoices';
import { formatCents } from '@/lib/money';
import { BUCKETS } from '@/lib/supabase/admin';
import { formatDateISO, formatET } from '@/lib/time';
import { createInvoiceFromBooking, deleteInspectionPhoto, saveBookingNotes, setBookingStatus } from '../../actions';

const STATUSES = Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[];

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from('bookings').select('*, customer:customers(*), vehicle:vehicles(*)').eq('id', id).maybeSingle();
  if (!data) notFound();
  const b = data as BookingWithRelations;

  const [{ data: invData }, photos, uploads] = await Promise.all([
    supabase.from('invoices').select('id, number, status, total_cents, created_at').eq('booking_id', b.id).order('created_at', { ascending: false }),
    getSignedInspectionPhotos({ bookingId: b.id }, supabase),
    b.media_paths.length
      ? supabase.storage.from(BUCKETS.customerUploads).createSignedUrls(b.media_paths, 3600).then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);
  const invoices = (invData ?? []) as Pick<InvoiceRow, 'id' | 'number' | 'status' | 'total_cents' | 'created_at'>[];
  const address = b.mode === 'mobile' ? `${b.service_street}, ${b.service_city}, ${b.service_state} ${b.service_zip}` : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-sm font-bold text-amber-700">{b.ref}</p>
              <h1 className="font-display text-2xl">{vehicleLabel(b.vehicle)}</h1>
              <p className="text-sm text-slate-600">{b.mode === 'mobile' ? 'Mobile dispatch' : 'Shop drop-off'} — {formatDateISO(b.scheduled_date, true)}, {b.window_label}</p>
            </div>
            <form action={setBookingStatus} className="flex items-center gap-2">
              <input type="hidden" name="id" value={b.id} />
              <select name="status" defaultValue={b.status} className="h-10 rounded-lg border-2 border-slate-300 px-2 text-sm font-bold">
                {STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>)}
              </select>
              <button className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white">Set</button>
            </form>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold text-slate-500">Customer</dt>
              <dd>{b.customer?.full_name}</dd>
              {b.customer?.phone && (
                <dd className="mt-1 flex gap-2">
                  <a href={`tel:${b.customer.phone}`} className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-xs font-bold text-white"><Phone className="h-3.5 w-3.5" aria-hidden />{b.customer.phone}</a>
                  <a href={`sms:${b.customer.phone}`} className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-xs font-bold"><MessageSquare className="h-3.5 w-3.5" aria-hidden />Text</a>
                </dd>
              )}
              {b.customer?.email && <dd className="break-all text-slate-600">{b.customer.email}</dd>}
            </div>
            <div>
              <dt className="font-bold text-slate-500">{b.mode === 'mobile' ? 'Service address' : 'Drop-off'}</dt>
              {address ? (
                <dd>
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 underline">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{address}
                  </a>
                  {b.parking_notes && <p className="mt-1 text-slate-600">{b.parking_notes}</p>}
                </dd>
              ) : (
                <dd>Shop bay {b.after_hours_key_drop && <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-800"><KeyRound className="h-3 w-3" aria-hidden />Key drop</span>}</dd>
              )}
            </div>
            <div>
              <dt className="font-bold text-slate-500">Vehicle</dt>
              <dd>{vehicleLabel(b.vehicle)}{b.vehicle?.engine ? `, ${b.vehicle.engine}` : ''}</dd>
              {b.vehicle?.vin && <dd className="font-mono text-xs">{b.vehicle.vin}</dd>}
              {b.vehicle?.mileage != null && <dd className="text-slate-600">{b.vehicle.mileage.toLocaleString('en-US')} mi</dd>}
            </div>
            <div>
              <dt className="font-bold text-slate-500">Payment</dt>
              <dd>{b.deposit_cents > 0 ? `Deposit ${formatCents(b.deposit_cents)} — ${b.deposit_status}` : 'Estimate first'}</dd>
              {b.promo_code && <dd>Promo <strong>{b.promo_code}</strong></dd>}
              <dd className="text-slate-500">Source: {b.utm_source ?? 'direct'}{b.utm_campaign ? ` / ${b.utm_campaign}` : ''}</dd>
            </div>
          </dl>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-bold">Services</p>
            <p>{b.service_ids.map((s) => SERVICE_BY_ID.get(s)?.name ?? s).join(', ') || '—'}</p>
            {b.symptoms && <p className="mt-2 whitespace-pre-line text-slate-700">{b.symptoms}</p>}
          </div>
        </section>

        {uploads.length > 0 && (
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="font-extrabold">Customer uploads</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {uploads.map((u) => (
                <li key={u.path ?? u.signedUrl}>
                  {u.signedUrl && /\.(mp4|mov|webm)$/i.test(u.path ?? '') ? (
                    <video src={u.signedUrl} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" />
                  ) : u.signedUrl ? (
                    <a href={u.signedUrl} target="_blank" rel="noopener noreferrer"><img src={u.signedUrl} alt="Customer upload" className="aspect-[4/3] w-full rounded-lg object-cover" /></a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="font-extrabold">Inspection photos ({photos.length})</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-lg border border-slate-200">
                {p.url && <img src={p.url} alt={p.title} className="aspect-[4/3] w-full object-cover" />}
                <div className="flex items-start justify-between gap-1 p-2 text-xs">
                  <span><strong className={p.rating === 'red' ? 'text-red-600' : p.rating === 'yellow' ? 'text-amber-600' : 'text-emerald-600'}>{p.rating.toUpperCase()}</strong> {p.title}</span>
                  <form action={deleteInspectionPhoto}><input type="hidden" name="id" value={p.id} /><button aria-label="Delete photo" className="text-slate-400 hover:text-red-600"><Trash className="h-4 w-4" /></button></form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-extrabold">Estimates & invoices</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/admin/invoices/${i.id}`} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 hover:bg-slate-100">
                  <span className="flex items-center gap-1 font-bold"><FileText className="h-4 w-4" aria-hidden />{i.number}</span>
                  <span>{i.status} · {formatCents(i.total_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <form action={createInvoiceFromBooking} className="mt-3">
            <input type="hidden" name="bookingId" value={b.id} />
            <button className="h-11 w-full rounded-lg bg-amber-500 font-extrabold text-slate-900">Build estimate</button>
          </form>
        </section>
        <DviUploader bookingId={b.id} invoiceId={null} />
        <form action={saveBookingNotes} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
          <input type="hidden" name="id" value={b.id} />
          <label htmlFor="notes" className="font-extrabold">Private notes</label>
          <textarea id="notes" name="admin_notes" rows={4} defaultValue={b.admin_notes ?? ''} className="w-full rounded-lg border-2 border-slate-300 p-2 text-sm" />
          <button className="h-10 w-full rounded-lg bg-slate-900 text-sm font-bold text-white">Save notes</button>
        </form>
        <p className="text-xs text-slate-500">Booked {formatET(b.created_at)}</p>
      </aside>
    </div>
  );
}
