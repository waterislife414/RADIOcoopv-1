import Link from 'next/link';
import { ArrowRight, MapPin, Receipt, ShieldCheck, Truck, Warehouse, Zap } from 'lucide-react';
import { BUSINESS } from '@/config/business';
import { PHOTOS } from '@/config/media';
import { PhotoSlot } from '@/components/ui/PhotoSlot';
import { formatCentsShort } from '@/lib/money';

export function Hero({ calloutFeeCents, diagnosticFeeCents }: { calloutFeeCents: number; diagnosticFeeCents: number }) {
  return (
    <section className="relative overflow-hidden bg-slate-900 text-white">
      <div className="grid-plate pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-6 md:grid-cols-[1.1fr_1fr] md:py-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Phenix City, AL · Columbus, GA
          </p>
          <h1 className="font-display mt-4 text-[2.35rem] sm:text-5xl lg:text-6xl">
            Honest Auto Repair — <span className="text-amber-400">In Our Shop or In Your Driveway</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-300 sm:text-lg">
            Itemized digital estimate before a wrench turns. {formatCentsShort(diagnosticFeeCents)} diagnostic{' '}
            <strong className="text-white">waived when you approve the repair</strong>.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/book?mode=mobile"
              className="group flex items-center gap-4 rounded-xl bg-amber-500 p-4 text-slate-900 shadow-lg shadow-amber-900/30 transition hover:bg-amber-400"
            >
              <Truck className="h-9 w-9 shrink-0" aria-hidden />
              <span className="flex-1">
                <span className="block text-lg font-extrabold leading-tight">Send a Mobile Mechanic</span>
                <span className="block text-sm font-semibold opacity-80">We come to you · {formatCentsShort(calloutFeeCents)} callout</span>
              </span>
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link
              href="/book?mode=shop"
              className="group flex items-center gap-4 rounded-xl border-2 border-white/80 p-4 text-white transition hover:bg-white hover:text-slate-900"
            >
              <Warehouse className="h-9 w-9 shrink-0" aria-hidden />
              <span className="flex-1">
                <span className="block text-lg font-extrabold leading-tight">Book a Shop Bay</span>
                <span className="block text-sm font-semibold opacity-80">Drop-off · after-hours key drop</span>
              </span>
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden /> {BUSINESS.hours.display} · {BUSINESS.hours.emergency}
          </p>
        </div>
        <PhotoSlot slot={PHOTOS.heroRig} dark priority sizes="(max-width: 768px) 100vw, 45vw" />
      </div>

      <ul className="relative grid grid-cols-2 border-t border-white/10 bg-slate-800 text-sm font-bold md:grid-cols-4">
        {[
          { icon: ShieldCheck, label: '12-Mo / 12K-Mile Warranty', tone: 'text-emerald-400' },
          { icon: Truck, label: 'Same-Day Mobile', tone: 'text-amber-400' },
          { icon: Receipt, label: 'Transparent Quotes', tone: 'text-amber-400' },
          { icon: MapPin, label: 'Serving Phenix City & Columbus', tone: 'text-amber-400' },
        ].map(({ icon: Icon, label, tone }) => (
          <li key={label} className="flex items-center gap-2 border-white/10 px-4 py-3 odd:border-r md:border-r md:last:border-r-0">
            <Icon className={`h-5 w-5 shrink-0 ${tone}`} aria-hidden />
            <span className="leading-tight">{label}</span>
          </li>
        ))}
      </ul>
      <div className="hazard h-1.5" aria-hidden />
    </section>
  );
}
