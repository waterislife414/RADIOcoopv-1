'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Clock, ShieldCheck, Truck, Warehouse } from 'lucide-react';
import type { ServiceMode } from '@/config/services';
import type { PricedService } from '@/lib/content';
import { formatCentsShort } from '@/lib/money';
import { ServiceIcon } from '@/components/home/ServiceIcon';

export function ServicesGrid({ services, diagnosticFeeCents, laborRateCents }: { services: PricedService[]; diagnosticFeeCents: number; laborRateCents: number }) {
  const [mode, setMode] = useState<ServiceMode>('mobile');
  const list: PricedService[] = services.filter((s) => s.mode === mode).map((s) =>
    s.id === 'diagnostics' ? { ...s, startingAtCents: diagnosticFeeCents } : s,
  );

  return (
    <section id="services" className="scroll-mt-20 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl">Straight pricing. No mystery markup.</h2>
            <p className="mt-2 max-w-2xl text-slate-600">
              “Starting at” flat rates for common jobs. Everything else is quoted line-by-line at {formatCentsShort(laborRateCents)}/hr
              shop labor — you approve the itemized estimate before work starts.
            </p>
          </div>
          <div role="tablist" aria-label="Service type" className="inline-flex rounded-xl bg-slate-200 p-1">
            {(
              [
                { id: 'mobile', label: 'Mobile-Eligible', icon: Truck },
                { id: 'shop', label: 'Shop Bay Only', icon: Warehouse },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={`flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold transition ${
                  mode === id ? 'bg-slate-900 text-white shadow' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-xl border-l-4 border-emerald-500 bg-white p-4 shadow-sm">
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-500" aria-hidden />
          <p className="text-sm sm:text-base">
            <strong>Diagnostic fee {formatCentsShort(diagnosticFeeCents)} — waived with repair.</strong>{' '}
            <span className="text-slate-600">Approve the fix and it comes off your bill.</span>
          </p>
        </div>

        <ul role="tabpanel" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <li key={s.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-900 text-amber-400">
                  <ServiceIcon name={s.icon} className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-extrabold leading-tight">
                    <Link href={`/services/${s.id}`} className="hover:underline">{s.name}</Link>
                  </h3>
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> {s.duration}
                  </p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-sm text-slate-600">{s.blurb}</p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <p>
                  {s.startingAtCents !== null && <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Starting at</span>}
                  {s.startingAtCents === null ? (
                    <span className="text-xl font-extrabold">Call for quote</span>
                  ) : (
                    <>
                      <span className="text-2xl font-extrabold">{formatCentsShort(s.startingAtCents)}</span>
                      {s.plusParts && <span className="ml-1 text-xs font-semibold text-slate-500">+ parts</span>}
                    </>
                  )}
                </p>
                <Link
                  href={`/book?mode=${s.mode}&service=${s.id}`}
                  className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-extrabold text-slate-900 hover:bg-amber-400"
                >
                  Book This
                </Link>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          Prices are starting points for most cars and light trucks; your exact price is on the itemized estimate. Sales tax per AL/GA jurisdiction.
        </p>
      </div>
    </section>
  );
}
