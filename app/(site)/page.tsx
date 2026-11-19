import { Suspense } from 'react';
import { CalendarCheck, CreditCard, FileText, ScanLine, ShieldCheck } from 'lucide-react';
import { BUSINESS } from '@/config/business';
import { BEFORE_AFTER, PHOTOS, VIDEOS } from '@/config/media';
import { BusinessJsonLd } from '@/components/layout/JsonLd';
import { BeforeAfter } from '@/components/home/BeforeAfter';
import { Faq } from '@/components/home/Faq';
import { Hero } from '@/components/home/Hero';
import { OffersBar } from '@/components/home/OffersBar';
import { RadiusChecker } from '@/components/home/RadiusChecker';
import { Reviews } from '@/components/home/Reviews';
import { ServicesGrid } from '@/components/home/ServicesGrid';
import { VideoShowcase } from '@/components/home/VideoShowcase';
import { ButtonLink } from '@/components/ui/Button';
import { PhotoSlot } from '@/components/ui/PhotoSlot';
import { getServices, getSiteSettings } from '@/lib/content';
import { getLivePromos, getRates } from '@/lib/db/settings';
import { LAUNCH } from '@/lib/mode';
import { formatCentsShort } from '@/lib/money';

export const revalidate = 300;

export default async function HomePage() {
  const [rates, promos, services, settings] = await Promise.all([getRates(), getLivePromos(), getServices(), getSiteSettings()]);
  const steps = LAUNCH
    ? [
        { icon: CalendarCheck, t: 'Book or call', d: 'Pick a day and time online in 2 minutes, or just call. Kyle confirms by text.' },
        { icon: ScanLine, t: 'Diagnose', d: `${formatCentsShort(rates.diagnosticFeeCents)} diagnosis, waived when you approve the repair. Can’t find it? You don’t pay.` },
        { icon: FileText, t: 'Price first', d: 'Kyle tells you the price before any work starts. Nothing gets added without asking.' },
        { icon: CreditCard, t: 'Pay & drive', d: `${settings.paymentNote} Can’t fix it? You don’t pay.` },
      ]
    : null;

  return (
    <>
      <BusinessJsonLd />
      <Hero calloutFeeCents={rates.mobileCalloutFeeCents} diagnosticFeeCents={rates.diagnosticFeeCents} />
      <Suspense fallback={null}>
        <OffersBar promos={promos} />
      </Suspense>
      <RadiusChecker calloutFeeCents={rates.mobileCalloutFeeCents} />
      <ServicesGrid services={services} diagnosticFeeCents={rates.diagnosticFeeCents} laborRateCents={rates.shopLaborRateCents} />

      {/* How pricing works */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-3xl sm:text-4xl">No surprise bills. Ever.</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {(steps ?? [
              { icon: ScanLine, t: 'Diagnose', d: `${formatCentsShort(rates.diagnosticFeeCents)} pro diagnosis, waived when you approve the repair. Can’t find it? You don’t pay.` },
              { icon: FileText, t: 'Itemized estimate', d: 'Parts, labor hours × rate, fees and tax — texted to you with inspection photos.' },
              { icon: ShieldCheck, t: 'You approve', d: 'Sign from your phone. No approval, no work. Nothing gets added without asking.' },
              { icon: CreditCard, t: 'Pay & drive', d: 'Card, Apple Pay or Google Pay. Can’t fix it? You don’t pay.' },
            ]).map(({ icon: Icon, t, d }, i) => (
              <li key={t} className="relative rounded-xl border border-slate-200 p-5">
                <span className="absolute -top-3 left-5 rounded bg-amber-500 px-2 text-xs font-black text-slate-900">STEP {i + 1}</span>
                <Icon className="h-7 w-7 text-slate-900" aria-hidden />
                <p className="mt-3 font-extrabold">{t}</p>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Proof: before/after + video */}
      <section className="bg-slate-800 text-white">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-14">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl">See the work</h2>
            <p className="mt-2 text-slate-300">Drag the slider. Same car, same angle, before and after.</p>
            <div className="mt-6">
              <BeforeAfter pairs={BEFORE_AFTER} />
            </div>
          </div>
          <div className="grid items-center gap-6 md:grid-cols-[1fr_2fr]">
            <div>
              <PhotoSlot slot={PHOTOS.kylePortrait} dark sizes="(max-width: 768px) 100vw, 33vw" />
            </div>
            <div>
              <h3 className="font-display text-2xl sm:text-3xl">Meet {BUSINESS.owner.name.split(' ')[0]} & the mobile rig</h3>
              <p className="mt-2 text-slate-300">
                {BUSINESS.owner.name}, {BUSINESS.owner.title.toLowerCase()}. The same tech who diagnoses your car is the one who fixes it — in the bay or in your driveway.
              </p>
              <div className="mt-4">
                <PhotoSlot slot={PHOTOS.shopBay} dark sizes="(max-width: 768px) 100vw, 66vw" />
              </div>
            </div>
          </div>
          <VideoShowcase videos={VIDEOS} />
        </div>
      </section>

      <Reviews googleReviewUrl={settings.googleReviewUrl} />
      <Faq />

      <section className="hazard p-1.5">
        <div className="bg-slate-900 text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-12 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-3xl">Broke down? Start here.</h2>
              <p className="mt-1 text-slate-300">Book in 2 minutes. Kyle confirms by text.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/book?mode=mobile" size="lg">Send a Mobile Mechanic</ButtonLink>
              <ButtonLink href="/book?mode=shop" variant="outlineLight" size="lg">Book a Shop Bay</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
