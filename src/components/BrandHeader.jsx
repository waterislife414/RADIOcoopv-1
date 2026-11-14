import { Link } from "react-router-dom";
import { COMPANY_WORDMARK, COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL } from "../config/constants";

export default function BrandHeader({ tagline }) {
  return (
    <div className="bg-navy-950 bg-grain relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/50 via-transparent to-navy-950" />
      <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-blue-600/20 blur-[80px]" />

      <Link
        to="/"
        className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 text-base font-bold text-white hover:text-gold-300 bg-white/[0.1] hover:bg-white/[0.16] border border-white/20 rounded-full px-4 min-h-[44px] transition"
      >
        &larr; Home
      </Link>

      <div className="relative block px-6 pt-16 pb-6 text-center">
        <h1 className="font-display font-semibold text-2xl sm:text-3xl tracking-tight text-white leading-none">
          {COMPANY_WORDMARK}
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm font-semibold tracking-[0.35em] text-gold-400 uppercase">
          Taxi Service
        </p>
        <a href={`tel:${COMPANY_PHONE_TEL}`} className="mt-0.5 inline-block py-1.5 px-2 text-sm font-mono text-slate-200 hover:text-gold-300">
          {COMPANY_PHONE_DISPLAY}
        </a>
        {tagline && (
          <p className="mt-1 text-lg font-semibold text-gold-200">{tagline}</p>
        )}
      </div>

      <div className="h-[2px] bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
    </div>
  );
}
