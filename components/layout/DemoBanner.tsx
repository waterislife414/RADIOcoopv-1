import Link from 'next/link';
import { DEMO, DEMO_INVOICE_TOKEN } from '@/lib/demo';

/** Visible only in demo builds so nobody mistakes the preview for the live booking system. */
export function DemoBanner() {
  if (!DEMO) return null;
  return (
    <div className="no-print bg-amber-400 px-4 py-2 text-center text-sm font-bold text-slate-900">
      Preview build: bookings, payments and emails are simulated.{' '}
      <Link href={`/invoice/${DEMO_INVOICE_TOKEN}`} className="underline underline-offset-2">Open a sample estimate</Link>
    </div>
  );
}
