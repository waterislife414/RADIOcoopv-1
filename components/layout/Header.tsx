import Link from 'next/link';
import { Phone, Wrench } from 'lucide-react';
import { BUSINESS, telHref } from '@/config/business';
import { ButtonLink } from '@/components/ui/Button';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/95 text-white backdrop-blur supports-[backdrop-filter]:bg-slate-900/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label={`${BUSINESS.name} home`}>
          <span className="grid h-9 w-9 place-items-center rounded-md bg-amber-500 text-slate-900">
            <Wrench className="h-5 w-5" aria-hidden />
          </span>
          <span className="font-display text-[17px] leading-none sm:text-lg">
            Kyle&apos;s Auto<span className="block text-[11px] font-semibold tracking-[0.2em] text-amber-400 [font-stretch:100%]">& MOBILE REPAIR</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-200 md:flex" aria-label="Main">
          <Link href="/#services" className="hover:text-white">Services & Pricing</Link>
          <Link href="/#coverage" className="hover:text-white">Service Area</Link>
          <Link href="/memberships" className="hover:text-white">Memberships</Link>
          <Link href="/#faq" className="hover:text-white">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          <a href={telHref} className="hidden items-center gap-2 text-sm font-bold text-white hover:text-amber-400 lg:flex">
            <Phone className="h-4 w-4" aria-hidden /> {BUSINESS.phone.display}
          </a>
          <ButtonLink href="/book" size="sm" className="hidden sm:inline-flex">Book Repair</ButtonLink>
        </div>
      </div>
    </header>
  );
}
