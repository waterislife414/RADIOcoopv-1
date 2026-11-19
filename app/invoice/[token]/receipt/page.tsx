import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { BUSINESS, BUSINESS_EMAIL } from '@/config/business';
import { InvoiceHeader } from '@/components/invoice/InvoiceHeader';
import { LineItems } from '@/components/invoice/LineItems';
import { PrintButton } from '@/components/invoice/PrintButton';
import { getInvoiceByToken } from '@/lib/invoices';
import { formatCents } from '@/lib/money';
import { formatET } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Official Receipt', robots: { index: false, follow: false } };

/** Print-optimized official receipt (Letter, 0.5in margins). "Save as PDF" from the browser print dialog. */
export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvoiceByToken(token);
  if (!inv) notFound();
  if (inv.status !== 'paid') redirect(`/invoice/${token}`);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:p-0">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/invoice/${token}`} className="flex items-center gap-1 text-sm font-bold text-slate-700"><ArrowLeft className="h-4 w-4" aria-hidden />Back</Link>
        <PrintButton />
      </div>

      <article className="print-card rounded-2xl bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-6 flex items-center justify-between border-b-4 border-slate-900 pb-4">
          <h1 className="font-display text-3xl">Official Receipt</h1>
          <span className="inline-flex items-center gap-1 rounded-full border-2 border-emerald-500 px-3 py-1 text-sm font-extrabold uppercase text-emerald-600">
            <CircleCheck className="h-4 w-4" aria-hidden /> Paid
          </span>
        </div>

        <InvoiceHeader inv={inv} title="Receipt" />

        <dl className="mt-6 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-bold uppercase text-slate-500">Date paid</dt><dd className="font-semibold">{inv.paid_at ? formatET(inv.paid_at) : '—'}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-slate-500">Amount paid</dt><dd className="font-semibold">{formatCents(inv.amount_paid_cents + inv.deposit_applied_cents)}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-bold uppercase text-slate-500">Stripe transaction ID</dt>
            <dd className="break-all font-mono text-xs">
              {inv.stripe_payment_intent_id ?? '—'}{inv.stripe_charge_id ? ` · ${inv.stripe_charge_id}` : ''}
            </dd>
          </div>
          {inv.approved_signature && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold uppercase text-slate-500">Work authorized by</dt>
              <dd className="font-semibold">“{inv.approved_signature}” {inv.approved_at ? `on ${formatET(inv.approved_at)}` : ''}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6">
          <LineItems inv={inv} compact />
        </div>

        <p className="mt-8 text-xs text-slate-600 print:break-inside-avoid">Questions about this job: {BUSINESS.phone.display} · {BUSINESS_EMAIL}. Reference receipt {inv.number}.</p>

        <p className="mt-6 text-center text-xs text-slate-500">Thank you for trusting {BUSINESS.name}. {BUSINESS.hours.display}.</p>
      </article>
    </main>
  );
}
