'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarCheck, Phone } from 'lucide-react';
import { BUSINESS, telHref } from '@/config/business';

/** Thumb-zone CTA bar for the roadside visitor. Hidden ≥ md and inside the booking flow (it has its own nav). */
export function StickyMobileBar() {
  const pathname = usePathname();
  if (pathname.startsWith('/book')) return null;
  return (
    <div
      className="no-print fixed inset-x-0 bottom-0 z-50 grid grid-cols-2 gap-2 border-t border-white/10 bg-slate-900/95 p-2 backdrop-blur md:hidden"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <a
        href={telHref}
        className="flex h-14 items-center justify-center gap-2 rounded-lg border-2 border-white/80 text-base font-extrabold text-white active:bg-white/10"
        aria-label={`Tap to call ${BUSINESS.shortName}`}
      >
        <Phone className="h-5 w-5" aria-hidden /> Tap to Call
      </a>
      <Link
        href="/book"
        className="flex h-14 items-center justify-center gap-2 rounded-lg bg-amber-500 text-base font-extrabold text-slate-900 active:bg-amber-600"
      >
        <CalendarCheck className="h-5 w-5" aria-hidden /> Book Repair
      </Link>
    </div>
  );
}
