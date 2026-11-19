import type { Metadata } from 'next';
import { BookingWizard, type WizardInitial } from '@/components/booking/BookingWizard';
import { getServices, getSiteSettings } from '@/lib/content';
import { getRates } from '@/lib/db/settings';
import { LAUNCH } from '@/lib/mode';
import { upcomingOpenDates } from '@/lib/time';

export const metadata: Metadata = {
  title: 'Book a Repair — Mobile Mechanic or Shop Drop-Off',
  description: 'Book a mobile mechanic or shop bay in Phenix City, AL or Columbus, GA. Pick a time window (Eastern Time), upload photos, get an itemized estimate.',
  alternates: { canonical: '/book' },
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function BookPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [rates, services, settings] = await Promise.all([getRates(), getServices(), getSiteSettings()]);
  const modeParam = one(sp.mode);
  const initial: WizardInitial = {
    mode: modeParam === 'mobile' || modeParam === 'shop' ? modeParam : null,
    serviceId: one(sp.service) || null,
    promo: one(sp.promo).slice(0, 24),
    zip: /^\d{5}$/.test(one(sp.zip)) ? one(sp.zip) : '',
    utm: {
      source: one(sp.utm_source) || undefined,
      medium: one(sp.utm_medium) || undefined,
      campaign: one(sp.utm_campaign) || undefined,
    },
  };
  return (
    <div className="min-h-[70vh] bg-slate-50">
      <BookingWizard
        initial={initial}
        openDates={upcomingOpenDates()}
        launch={LAUNCH}
        services={services}
        paymentNote={settings.paymentNote}
        rates={{ calloutFeeCents: rates.mobileCalloutFeeCents, depositCents: rates.bookingDepositCents, diagnosticFeeCents: rates.diagnosticFeeCents }}
      />
    </div>
  );
}
