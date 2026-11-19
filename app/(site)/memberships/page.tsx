import type { Metadata } from 'next';
import { CircleCheck, CreditCard, Gauge, Truck } from 'lucide-react';
import { PLANS, type PlanId } from '@/config/memberships';
import { ManageBillingButton, MembershipPlans } from '@/components/memberships/MembershipPlans';
import { redirect } from 'next/navigation';
import { DEMO } from '@/lib/demo';
import { LAUNCH } from '@/lib/mode';
import { publicEnv } from '@/lib/env';
import { membershipPriceId } from '@/lib/stripe';

export const metadata: Metadata = {
  title: 'Maintenance Memberships & Fleet Plans',
  description: 'Car maintenance memberships in Phenix City & Columbus: synthetic oil changes, priority mobile dispatch, waived callouts, 10% off labor. Commercial fleet plans with net-15 terms.',
  alternates: { canonical: '/memberships' },
};

export const dynamic = 'force-dynamic';

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<{ status?: string; session_id?: string }> }) {
  if (LAUNCH) redirect('/');
  const sp = await searchParams;
  const availability = Object.fromEntries(
    PLANS.map((p) => [p.id, { month: DEMO || Boolean(membershipPriceId(p.id, 'month')), year: (DEMO && p.annualCents !== null) || Boolean(membershipPriceId(p.id, 'year')) }]),
  ) as Record<PlanId, { month: boolean; year: boolean }>;

  return (
    <div className="bg-slate-50">
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center">
          <h1 className="font-display text-4xl sm:text-5xl">Keep it running. Skip the line.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">Memberships for daily drivers, families and local work fleets. Cancel anytime from your billing portal.</p>
          <ul className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-4 text-sm font-semibold text-slate-200">
            <li className="flex items-center gap-1.5"><Truck className="h-4 w-4 text-amber-400" aria-hidden />Priority mobile dispatch</li>
            <li className="flex items-center gap-1.5"><Gauge className="h-4 w-4 text-amber-400" aria-hidden />Free OBD-II scans</li>
            <li className="flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-amber-400" aria-hidden />Card · Apple Pay · Google Pay</li>
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12">
        {sp.status === 'success' && (
          <div className="mb-8 flex flex-col items-start gap-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 font-bold text-emerald-800"><CircleCheck className="h-5 w-5" aria-hidden />You’re in! Welcome email on the way.</p>
            {sp.session_id && <ManageBillingButton sessionId={sp.session_id} />}
          </div>
        )}
        {sp.status === 'cancelled' && (
          <p className="mb-8 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Checkout cancelled — no charge was made.</p>
        )}

        <MembershipPlans plans={PLANS} availability={availability} />

        <div className="mt-10 text-center text-sm text-slate-600">
          Already a member?{' '}
          {publicEnv.stripePortalLoginUrl ? (
            <a href={publicEnv.stripePortalLoginUrl} className="font-bold text-slate-900 underline decoration-amber-500 decoration-2 underline-offset-4">
              Manage billing, update card, or cancel
            </a>
          ) : (
            <span>Use the “Manage subscription” link in any Stripe receipt email.</span>
          )}
        </div>
      </div>
    </div>
  );
}
