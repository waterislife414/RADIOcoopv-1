'use client';

import { useState } from 'react';
import { Check, LoaderCircle, Mail, Phone } from 'lucide-react';
import { mailtoHref, telHref } from '@/config/business';
import type { Interval, Plan, PlanId } from '@/config/memberships';
import { formatCentsShort } from '@/lib/money';
import { buttonClasses } from '@/components/ui/Button';

type Availability = Record<PlanId, { month: boolean; year: boolean }>;

export function MembershipPlans({ plans, availability }: { plans: readonly Plan[]; availability: Availability }) {
  const [interval, setBillingInterval] = useState<Interval>('month');
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function start(plan: PlanId, iv: Interval) {
    setBusy(plan);
    setErr(null);
    const r = await fetch('/api/checkout/membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, interval: iv }),
    });
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (j.url) window.location.assign(j.url);
    else {
      setErr(j.error ?? 'Could not start checkout.');
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing interval" className="inline-flex rounded-xl bg-slate-200 p-1">
          {(['month', 'year'] as const).map((iv) => (
            <button
              key={iv}
              role="radio"
              aria-checked={interval === iv}
              onClick={() => setBillingInterval(iv)}
              className={`h-11 rounded-lg px-5 text-sm font-bold ${interval === iv ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
            >
              {iv === 'month' ? 'Monthly' : 'Annual · 2 months free'}
            </button>
          ))}
        </div>
      </div>
      {err && <p role="alert" className="mt-4 text-center text-sm font-semibold text-red-600">{err}</p>}

      <ul className="mt-8 grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const iv: Interval = p.annualCents === null ? 'month' : interval;
          const price = iv === 'year' && p.annualCents !== null ? p.annualCents : p.monthlyCents;
          const canBuy = availability[p.id][iv];
          return (
            <li
              key={p.id}
              id={p.id === 'fleet' ? 'fleet' : undefined}
              className={`relative flex scroll-mt-24 flex-col rounded-2xl border-2 bg-white p-6 ${p.highlight ? 'border-amber-500 shadow-xl shadow-amber-900/10' : 'border-slate-200'}`}
            >
              {p.highlight && <span className="absolute -top-3 left-6 rounded bg-amber-500 px-2 py-0.5 text-xs font-black uppercase text-slate-900">Most popular</span>}
              <h3 className="font-display text-2xl">{p.name}</h3>
              <p className="text-sm text-slate-600">{p.tagline}</p>
              <p className="mt-4">
                <span className="text-4xl font-black">{formatCentsShort(price)}</span>
                <span className="text-sm font-semibold text-slate-500">{iv === 'year' ? '/yr' : '/mo'}{p.custom ? '+' : ''}</span>
              </p>
              {iv === 'year' && p.annualCents !== null && (
                <p className="text-xs font-semibold text-emerald-700">≈ {formatCentsShort(Math.round(p.annualCents / 12))}/mo · save {formatCentsShort(p.monthlyCents * 12 - p.annualCents)}</p>
              )}
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />{f}</li>
                ))}
              </ul>
              <div className="mt-6 space-y-2">
                {canBuy && (
                  <button type="button" disabled={busy !== null} onClick={() => void start(p.id, iv)} className={buttonClasses(p.highlight ? 'primary' : 'dark', 'lg', 'w-full')}>
                    {busy === p.id && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />}
                    {p.custom ? 'Start fleet plan' : `Join ${p.name}`}
                  </button>
                )}
                {(p.custom || !canBuy) && (
                  <div className="grid grid-cols-2 gap-2">
                    <a href={mailtoHref(`${p.name} quote`)} className={buttonClasses('outline', 'md')}><Mail className="h-4 w-4" aria-hidden />Get quote</a>
                    <a href={telHref} className={buttonClasses('outline', 'md')}><Phone className="h-4 w-4" aria-hidden />Call</a>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ManageBillingButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={buttonClasses('dark', 'md')}
      onClick={async () => {
        setBusy(true);
        const r = await fetch('/api/billing-portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
        const j = (await r.json().catch(() => ({}))) as { url?: string };
        if (j.url) window.location.assign(j.url);
        else setBusy(false);
      }}
    >
      {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />} Manage billing
    </button>
  );
}
