import Link from 'next/link';
import { Phone, Wrench } from 'lucide-react';
import { BUSINESS, telHref } from '@/config/business';
import { DemoBanner } from '@/components/layout/DemoBanner';

export default function InvoiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <DemoBanner />
      <header className="no-print bg-slate-900 text-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-display text-base">
            <span className="grid h-8 w-8 place-items-center rounded bg-amber-500 text-slate-900"><Wrench className="h-4 w-4" aria-hidden /></span>
            {BUSINESS.shortName}
          </Link>
          <a href={telHref} className="flex items-center gap-1.5 text-sm font-bold hover:text-amber-400">
            <Phone className="h-4 w-4" aria-hidden /> {BUSINESS.phone.display}
          </a>
        </div>
        <div className="hazard h-1" aria-hidden />
      </header>
      {children}
    </div>
  );
}
