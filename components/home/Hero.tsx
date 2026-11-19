import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, MapPin, Receipt, ShieldCheck, Truck, Warehouse, Zap } from 'lucide-react';
import { BUSINESS } from '@/config/business';
import { PHOTOS } from '@/config/media';
import { formatCentsShort } from '@/lib/money';
import { LAUNCH } from '@/lib/mode';

/**
 * Full-bleed night-rescue photo behind the headline. Gradients keep text readable:
 * mobile fades top→bottom (photo shows above the headline), desktop fades left→right (photo on the right).
 */
export function Hero({ calloutFeeCents, diagnosticFeeCents }: { calloutFeeCents: number; diagnosticFeeCents: number }) {
  const bg = PHOTOS.heroRescue;
  return (
    <section className="relative isolate overflow-hidden bg-slate-900 text-white">
      {bg.src ? (
        <div className="absolute inset-x-0 top-0 -z-10 h-[310px] sm:h-[420px] md:inset-0 md:h-auto">
          <Image src={bg.src} alt={bg.alt} fill priority sizes="100vw" className="object-cover object-center md:object-[75%_center]" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-slate-900/0 via-slate-900/25 to-slate-900 md:bg-gradient-to-r md:from-slate-900 md:via-slate-900/80 md:to-slate-900/10"
          />
        </div>
      ) : (
        <div className="grid-plate pointer-events-none absolute inset-0 -z-10" aria-hidden />
      )}

      <div className="mx-auto max-w-6xl px-4 pb-10 pt-[15rem] sm:pt-[21rem] md:py-24 lg:py-28">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-slate-900/60 px-3 py-1 text-xs font-bold text-amber-300 backdrop-blur">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Phenix City, AL & Columbus, GA
          </p>
          <h1 className="font-display mt-4 text-[2.35rem] drop-shadow-[0_2px_12px_rgba(0,0,0,.6)] sm:text-5xl lg:text-6xl">
            Honest Auto Repair — <span className="text-amber-400">In Our Shop or In Your Driveway</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-200 sm:text-lg">
            {LAUNCH ? 'You know the price before any work starts.' : 'Itemized digital estimate before a wrench turns.'} {formatCentsShort(diagnosticFeeCents)} diagnostic{' '}
            <strong className="text-white">waived when you approve the repair</strong>. Can’t fix it? You don’t pay.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/book?mode=mobile"
              className="group flex items-center gap-4 rounded-xl bg-amber-500 p-4 text-slate-900 shadow-lg shadow-black/40 transition hover:bg-amber-400"
            >
              <Truck className="h-9 w-9 shrink-0" aria-hidden />
              <span className="flex-1">
                <span className="block text-lg font-extrabold leading-tight">Send a Mobile Mechanic</span>
                <span className="block text-sm font-semibold opacity-80">We come to you. {formatCentsShort(calloutFeeCents)} callout</span>
              </span>
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link
              href="/book?mode=shop"
              className="group flex items-center gap-4 rounded-xl border-2 border-white/80 bg-slate-900/50 p-4 text-white backdrop-blur transition hover:bg-white hover:text-slate-900"
            >
              <Warehouse className="h-9 w-9 shrink-0" aria-hidden />
              <span className="flex-1">
                <span className="block text-lg font-extrabold leading-tight">Book a Shop Bay</span>
                <span className="block text-sm font-semibold opacity-80">Drop off, or use the after-hours key drop</span>
              </span>
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-300">
            <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden /> {BUSINESS.hours.display}. {BUSINESS.hours.emergency}.
          </p>
        </div>
      </div>

      <ul className="relative grid grid-cols-2 border-t border-white/10 bg-slate-800/95 text-sm font-bold md:grid-cols-4">
        {[
          { icon: ShieldCheck, label: BUSINESS.guarantee.short, tone: 'text-emerald-400' },
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
