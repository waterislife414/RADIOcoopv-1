import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, CircleCheck, Clock, Printer, ShieldCheck } from 'lucide-react';
import { BUSINESS } from '@/config/business';
import { ApproveForm } from '@/components/invoice/ApproveForm';
import { DviGallery } from '@/components/invoice/DviGallery';
import { InvoiceHeader } from '@/components/invoice/InvoiceHeader';
import { LineItems } from '@/components/invoice/LineItems';
import { PayNowButton } from '@/components/invoice/PayNowButton';
import { absoluteUrl } from '@/lib/env';
import { balanceDueCents } from '@/lib/invoice-math';
import { getInvoiceByToken, getSignedInspectionPhotos } from '@/lib/invoices';
import { qrSvg } from '@/lib/qr';
import { formatET } from '@/lib/time';
import { approveEstimate } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Estimate & Invoice', robots: { index: false, follow: false } };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const inv = await getInvoiceByToken(token);
  if (!inv || inv.status === 'draft') notFound();

  const photos = await getSignedInspectionPhotos({ invoiceId: inv.id, bookingId: inv.booking_id });
  const balance = balanceDueCents(inv);
  const qr = await qrSvg(absoluteUrl(`/invoice/${inv.token}`), { margin: 2 });
  const title = inv.status === 'paid' ? 'Paid invoice' : inv.status === 'approved' ? 'Approved estimate / invoice' : 'Estimate';

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {sp.paid === '1' && inv.status !== 'paid' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          <Clock className="h-5 w-5" aria-hidden /> Payment received — finalizing. Your receipt will be emailed in a moment. Refresh to see it.
        </p>
      )}

      {inv.status === 'void' && <p className="mb-4 rounded-xl bg-slate-200 p-4 font-bold">This invoice was voided. Questions? Call {BUSINESS.phone.display}.</p>}

      <article className="print-card rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {inv.status === 'sent' && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold uppercase text-amber-800">Awaiting your approval</span>}
          {inv.status === 'approved' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold uppercase text-emerald-800">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Approved {inv.approved_at ? formatET(inv.approved_at) : ''}
            </span>
          )}
          {inv.status === 'paid' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-extrabold uppercase text-white">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Paid {inv.paid_at ? formatET(inv.paid_at) : ''}
            </span>
          )}
        </div>

        <InvoiceHeader inv={inv} title={title} />

        <div className="mt-6">
          <LineItems inv={inv} />
        </div>

        {inv.notes && (
          <div className="mt-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">
            <p className="font-bold">Technician notes</p>
            <p className="whitespace-pre-line text-slate-700">{inv.notes}</p>
          </div>
        )}

        <DviGallery photos={photos} />

        <div className="no-print mt-8 space-y-4">
          {inv.status === 'sent' && <ApproveForm action={approveEstimate.bind(null, inv.token)} totalCents={inv.total_cents} />}
          {inv.status === 'approved' && balance > 0 && <PayNowButton token={inv.token} balanceCents={balance} />}
          {inv.status === 'approved' && inv.approved_signature && (
            <p className="text-center text-xs text-slate-500">Approved by “{inv.approved_signature}”</p>
          )}
          {inv.status === 'paid' && (
            <Link href={`/invoice/${inv.token}/receipt`} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-lg font-extrabold text-white">
              <Printer className="h-5 w-5" aria-hidden /> View / Print Official Receipt
            </Link>
          )}
        </div>

        <footer className="mt-8 grid gap-4 border-t border-slate-200 pt-6 text-xs text-slate-600 sm:grid-cols-[1fr_auto]">
          <p className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
            <span><strong>{BUSINESS.guarantee.short}.</strong> {BUSINESS.guarantee.terms}</span>
          </p>
          <div className="hidden w-24 sm:block" aria-label="QR code for this invoice" dangerouslySetInnerHTML={{ __html: qr }} />
        </footer>
      </article>
    </main>
  );
}
