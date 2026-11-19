import Link from 'next/link';
import { Clock, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { BUSINESS, BUSINESS_EMAIL, mailtoHref, publicShopAddress, telHref } from '@/config/business';

export function Footer() {
  const addr = publicShopAddress();
  return (
    <footer className="border-t-4 border-amber-500 bg-slate-900 pb-24 text-slate-300 md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-3">
        <div>
          <p className="font-display text-xl text-white">{BUSINESS.name}</p>
          <p className="mt-2 text-sm">Shop bay + mobile mechanic serving Phenix City, Smiths Station, Ladonia, Columbus & Fort Benning.</p>
          <p className="mt-4 flex items-start gap-2 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden /> {BUSINESS.guarantee.display}
          </p>
        </div>
        <address className="space-y-3 text-sm not-italic">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <span>
              {addr.line}
              {addr.note && <span className="block text-xs text-slate-400">{addr.note}</span>}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-amber-400" aria-hidden />
            <a href={telHref} className="font-semibold text-white hover:text-amber-400">{BUSINESS.phone.display}</a>
          </p>
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-amber-400" aria-hidden />
            <a href={mailtoHref('Repair question')} className="break-all hover:text-amber-400">{BUSINESS_EMAIL}</a>
          </p>
          <p className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <span>{BUSINESS.hours.display}<span className="block text-xs text-amber-300">{BUSINESS.hours.emergency}</span></span>
          </p>
        </address>
        <nav className="grid grid-cols-2 gap-2 text-sm" aria-label="Footer">
          <Link href="/book?mode=mobile" className="hover:text-white">Mobile Mechanic</Link>
          <Link href="/book?mode=shop" className="hover:text-white">Shop Drop-Off</Link>
          <Link href="/#services" className="hover:text-white">Pricing</Link>
          <Link href="/memberships" className="hover:text-white">Memberships</Link>
          <Link href="/memberships#fleet" className="hover:text-white">Fleet Plans</Link>
          <Link href="/#faq" className="hover:text-white">FAQ</Link>
          <a href={BUSINESS.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white">Leave a Review</a>
        </nav>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {BUSINESS.name}. All appointment times Eastern (ET).
      </div>
    </footer>
  );
}
