'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CircleCheck, Info, MapPin, Phone, Warehouse } from 'lucide-react';
import { BUSINESS, telHref } from '@/config/business';
import { MOBILE_ZIPS, SERVICE_AREA, checkCoverage, type CoverageResult } from '@/config/serviceArea';
import { formatCentsShort } from '@/lib/money';
import { LAUNCH } from '@/lib/mode';
import { buttonClasses } from '@/components/ui/Button';
import { PhotoSlot } from '@/components/ui/PhotoSlot';
import { PHOTOS } from '@/config/media';

export function RadiusChecker({ calloutFeeCents }: { calloutFeeCents: number }) {
  const [zip, setZip] = useState('');
  const [result, setResult] = useState<CoverageResult | null>(null);

  const run = (value: string) => setResult(checkCoverage(value, calloutFeeCents));

  const towns = Array.from(new Set(MOBILE_ZIPS.map((z) => z.city.replace(/\s*\(.*\)$/, '').split(' / ')[0]!)));

  return (
    <section id="coverage" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="font-display text-3xl">Will the truck come to you?</h2>
            <p className="mt-2 text-slate-600">
              Mobile service covers about {SERVICE_AREA.radiusMiles} miles from our Phenix City base — both sides of the river.
            </p>
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(zip);
              }}
            >
              <label htmlFor="zip-check" className="sr-only">ZIP code</label>
              <input
                id="zip-check"
                inputMode="numeric"
                autoComplete="postal-code"
                pattern="\d{5}"
                maxLength={5}
                placeholder="Enter ZIP (e.g. 36869)"
                value={zip}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setZip(v);
                  if (v.length === 5) run(v);
                  else setResult(null);
                }}
                className="h-14 min-w-0 flex-1 rounded-lg border-2 border-slate-300 px-4 text-lg font-semibold tracking-widest placeholder:font-normal placeholder:tracking-normal focus:border-amber-500 focus:outline-none"
              />
              <button type="submit" className={buttonClasses('dark', 'lg')}>Check</button>
            </form>

            <div aria-live="polite" className="mt-4 min-h-[1rem]">
              {result?.status === 'mobile' && (
                <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4">
                  <p className="flex items-center gap-2 font-extrabold text-emerald-800">
                    <CircleCheck className="h-5 w-5" aria-hidden /> Yes — we come to you in {result.entry.city}, {result.entry.state}.
                  </p>
                  <p className="mt-1 text-sm text-emerald-900">
                    Mobile callout: <strong>{formatCentsShort(result.calloutFeeCents)}</strong>{LAUNCH ? '.' : ' (waived 2×/yr for members).'}
                  </p>
                  <Link href={`/book?mode=mobile&zip=${result.entry.zip}`} className={buttonClasses('primary', 'md', 'mt-3 w-full sm:w-auto')}>
                    Send a Mobile Mechanic
                  </Link>
                </div>
              )}
              {result?.status === 'shop-only' && (
                <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
                  <p className="flex items-center gap-2 font-extrabold text-amber-900">
                    <Info className="h-5 w-5" aria-hidden />
                    {result.reason === 'outside-radius' && result.entry
                      ? `${result.entry.city} is ~${result.entry.approxMiles} mi out — past our mobile radius.`
                      : `${zip} isn’t on our mobile list yet.`}
                  </p>
                  <p className="mt-1 text-sm text-amber-900">Drop it at our Phenix City bay instead — same pricing, same no-fix-no-charge promise.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/book?mode=shop" className={buttonClasses('dark', 'md')}>
                      <Warehouse className="h-4 w-4" aria-hidden /> Book Shop Drop-Off
                    </Link>
                    <a href={telHref} className={buttonClasses('outline', 'md')}>
                      <Phone className="h-4 w-4" aria-hidden /> Ask Kyle
                    </a>
                  </div>
                </div>
              )}
              {result?.status === 'invalid' && <p className="text-sm text-red-600">Enter a 5-digit ZIP code.</p>}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-slate-900 text-white">
            <PhotoSlot slot={PHOTOS.heroRig} dark className="rounded-none" sizes="(max-width: 768px) 100vw, 50vw" />
            <div className="p-6">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-400">
              <MapPin className="h-4 w-4" aria-hidden /> Mobile coverage
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {towns.map((t) => (
                <li key={t} className="rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold">{t}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-400">
              Outside the circle? {BUSINESS.shortName}’s shop bay is in {BUSINESS.address.city}, {BUSINESS.address.region} {BUSINESS.address.postalCode}, with after-hours key drop.
            </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
