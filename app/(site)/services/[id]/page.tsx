import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, CircleCheck } from 'lucide-react';
import { SERVICES, SERVICE_BY_ID } from '@/config/services';
import { BUSINESS, telHref } from '@/config/business';
import { ButtonLink, buttonClasses } from '@/components/ui/Button';
import { formatCentsShort } from '@/lib/money';
import { getServices } from '@/lib/content';

const priceLabel = (c: number | null) => (c === null ? 'Call for quote' : formatCentsShort(c));

export async function generateStaticParams() {
  return SERVICES.map((s) => ({ id: s.id }));
}

export const dynamicParams = false;
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = SERVICE_BY_ID.get(id);
  if (!s) return {};
  return {
    title: `${s.name} in Phenix City, AL & Columbus, GA`,
    description: `${s.blurb} Starting at ${priceLabel(s.startingAtCents)}.`,
    alternates: { canonical: `/services/${s.id}` },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const live = await getServices();
  const s = live.find((x) => x.id === id) ?? (SERVICE_BY_ID.get(id) ? null : undefined);
  if (!s) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s.name,
    serviceType: s.name,
    areaServed: BUSINESS.areaServed.map((a) => `${a.name}, ${a.region}`),
    provider: {
      '@type': 'AutoRepair',
      name: BUSINESS.name,
      telephone: BUSINESS.phone.e164,
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      ...(s.startingAtCents !== null ? { price: (s.startingAtCents / 100).toFixed(2) } : {}),
    },
  };

  const otherServices = live.filter((o) => o.mode === s.mode && o.id !== s.id);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <span className="inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-400 ring-1 ring-amber-500/20">
            {s.mode === 'mobile' ? 'We come to you' : 'Shop bay'}
          </span>
          <h1 className="font-display mt-3 text-4xl">{s.name}</h1>
          <p className="mt-4">
            <span className="text-sm text-slate-400">Starting at</span>{' '}
            <span className="text-4xl font-black text-white">{priceLabel(s.startingAtCents)}</span>
            {s.plusParts && <span className="text-sm text-slate-400"> + parts</span>}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
            <Clock className="h-4 w-4 text-amber-400" aria-hidden /> Estimated time: {s.duration}
          </p>
          <p className="mt-4 text-lg text-slate-300">{s.blurb}</p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <ul className="space-y-3">
            <li className="flex items-center gap-3 text-slate-700">
              <CircleCheck className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
              <span>{BUSINESS.guarantee.display}</span>
            </li>
            <li className="flex items-center gap-3 text-slate-700">
              <CircleCheck className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
              <span>Diagnostic fee waived with repair</span>
            </li>
            <li className="flex items-center gap-3 text-slate-700">
              <CircleCheck className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
              <span>Itemized estimate before any work</span>
            </li>
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={`/book?mode=${s.mode}&service=${s.id}`} size="lg">
              Book this repair
            </ButtonLink>
            <a href={telHref} className={buttonClasses('outline', 'lg')}>
              Call {BUSINESS.phone.display}
            </a>
          </div>

          {otherServices.length > 0 && (
            <div className="mt-12 border-t border-slate-200 pt-8">
              <h2 className="font-display text-xl font-bold text-slate-900">More services</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {otherServices.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/services/${o.id}`}
                      className="block rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-800 hover:border-amber-500 hover:bg-amber-50/50"
                    >
                      {o.name} <span className="text-slate-500">({priceLabel(o.startingAtCents)})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
