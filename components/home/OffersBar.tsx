'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Ticket } from 'lucide-react';
import type { Promo } from '@/config/promos';

function claimHref(p: Promo): string {
  const q = new URLSearchParams({ promo: p.code });
  if (p.scope !== 'any') q.set('mode', p.scope);
  if (p.service_id) q.set('service', p.service_id);
  return `/book?${q.toString()}`;
}

/** Claimable offers. `?offer=CODE` (e.g. truck-wrap QR) surfaces & highlights a hidden promo. */
export function OffersBar({ promos }: { promos: Promo[] }) {
  const params = useSearchParams();
  const offer = params.get('offer')?.toUpperCase() ?? null;
  const unlocked = offer ? promos.find((p) => p.code === offer) ?? null : null;
  const list = [
    ...(unlocked ? [unlocked] : []),
    ...promos.filter((p) => p.featured && p.code !== unlocked?.code),
  ];
  if (list.length === 0) return null;

  return (
    <section aria-labelledby="offers-h" className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h2 id="offers-h" className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-amber-900">
          <Ticket className="h-4 w-4" aria-hidden /> Active offers — tap to claim
        </h2>
        <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {list.map((p) => {
            const isUnlocked = p.code === unlocked?.code;
            return (
              <li
                key={p.code}
                className={`flex w-[82%] shrink-0 snap-start flex-col rounded-xl border-2 bg-white p-4 md:w-auto ${
                  isUnlocked ? 'border-amber-500 ring-4 ring-amber-300/50' : 'border-amber-200'
                }`}
              >
                {isUnlocked && (
                  <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-extrabold uppercase text-slate-900">
                    <Sparkles className="h-3 w-3" aria-hidden /> Unlocked
                  </span>
                )}
                <p className="font-extrabold leading-snug text-slate-900">{p.title}</p>
                {p.description && <p className="mt-1 flex-1 text-sm text-slate-600">{p.description}</p>}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <code className="rounded border border-dashed border-slate-400 px-2 py-1 text-xs font-bold tracking-wider">{p.code}</code>
                  <Link href={claimHref(p)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                    Claim
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
