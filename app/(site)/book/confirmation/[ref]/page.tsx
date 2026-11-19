import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarPlus, CircleCheck, Clock, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { BUSINESS, publicShopAddress, telHref } from '@/config/business';
import { SERVICE_BY_ID } from '@/config/services';
import { getBookingByRef, vehicleLabel } from '@/lib/bookings';
import { formatCents } from '@/lib/money';
import { formatDateISO } from '@/lib/time';
import { buttonClasses } from '@/components/ui/Button';
import { RetryDepositButton } from '@/components/booking/RetryDepositButton';

export const metadata: Metadata = { title: 'Booking Confirmed', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ deposit?: string }>;
}) {
  const [{ ref }, sp] = await Promise.all([params, searchParams]);
  const b = await getBookingByRef(ref.toUpperCase());
  if (!b) notFound();

  const first = b.customer?.full_name.split(' ')[0] ?? 'there';
  const services = b.service_ids.map((id) => SERVICE_BY_ID.get(id)?.name ?? id).join(', ') || 'Diagnosis';
  // Webhook may land a second after redirect; trust ?deposit=success for messaging only.
  const depositPaid = b.deposit_status === 'paid' || sp.deposit === 'success';
  const depositOutstanding = b.deposit_cents > 0 && !depositPaid;
  const shop = publicShopAddress();

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
            <span>Step 6 of 6 · Confirmed</span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-emerald-500" />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-emerald-600">
            <CircleCheck className="h-5 w-5" aria-hidden /> Request received
          </p>
          <h1 className="font-display mt-2 text-3xl">You’re on the board, {first}.</h1>
          <p className="mt-2 text-slate-600">Kyle will confirm by text. A copy was emailed to you{b.customer?.email ? ` at ${b.customer.email}` : ''}.</p>

          <div className="mt-5 rounded-xl bg-slate-900 p-4 text-white">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Booking reference</p>
            <p className="font-mono text-3xl font-black tracking-widest text-amber-400">{b.ref}</p>
          </div>

          <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
            <dt className="flex items-center gap-1 text-slate-500"><Clock className="h-4 w-4" aria-hidden />When</dt>
            <dd className="font-semibold">{formatDateISO(b.scheduled_date, true)}<br />{b.window_label} <span className="text-amber-700">(Eastern Time)</span></dd>
            <dt className="flex items-center gap-1 text-slate-500"><MapPin className="h-4 w-4" aria-hidden />Where</dt>
            <dd className="font-semibold">
              {b.mode === 'mobile' ? `Mobile — ${b.service_city}, ${b.service_state} ${b.service_zip}` : <>Shop drop-off — {shop.line}{shop.note && <span className="block text-xs font-normal text-slate-500">{shop.note}</span>}</>}
              {b.after_hours_key_drop && <span className="block text-xs font-normal">After-hours key drop requested</span>}
            </dd>
            <dt className="text-slate-500">Vehicle</dt><dd className="font-semibold">{vehicleLabel(b.vehicle)}</dd>
            <dt className="text-slate-500">Services</dt><dd className="font-semibold">{services}</dd>
            {b.promo_code && (<><dt className="text-slate-500">Promo</dt><dd className="font-semibold">{b.promo_code}</dd></>)}
            <dt className="text-slate-500">Payment</dt>
            <dd className="font-semibold">
              {b.deposit_cents === 0 && 'Free estimate first — nothing charged'}
              {b.deposit_cents > 0 && depositPaid && <span className="text-emerald-700">Deposit {formatCents(b.deposit_cents)} paid ✓</span>}
              {depositOutstanding && <span className="text-amber-700">Deposit {formatCents(b.deposit_cents)} not completed</span>}
            </dd>
          </dl>

          {sp.deposit === 'cancelled' && depositOutstanding && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Your booking is saved, but the deposit didn’t go through. You can pay it now or leave it — Kyle will still confirm.
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href={`/api/bookings/${b.ref}/ics`} className={buttonClasses('dark', 'lg', 'flex-1')}>
              <CalendarPlus className="h-5 w-5" aria-hidden /> Add to calendar
            </a>
            {depositOutstanding ? <RetryDepositButton refCode={b.ref} /> : (
              <a href={telHref} className={buttonClasses('outline', 'lg', 'flex-1')}>
                <Phone className="h-5 w-5" aria-hidden /> {BUSINESS.phone.display}
              </a>
            )}
          </div>
        </div>

        <p className="mt-6 flex items-start gap-2 text-sm text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
          Next: you’ll get an itemized digital estimate with inspection photos. No work starts until you approve it. {BUSINESS.warranty.display}.
        </p>
      </div>
    </div>
  );
}
