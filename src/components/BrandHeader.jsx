import { Link } from "react-router-dom";
import { COMPANY_WORDMARK } from "../config/constants";

export default function BrandHeader({ tagline }) {
  return (
    <div className="bg-navy-950 bg-grain relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/50 via-transparent to-navy-950" />
      <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-blue-600/20 blur-[80px]" />

      <Link
        to="/"
        className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-gold-300 bg-white/[0.06] hover:bg-white/[0.1] rounded-full px-3.5 py-2 transition"
      >
        &larr; Home
      </Link>

      <div className="relative block px-6 pt-16 pb-6 text-center">
        <h1 className="font-display font-semibold text-2xl sm:text-3xl tracking-tight text-white leading-none">
          {COMPANY_WORDMARK}
        </h1>
        <p className="mt-1.5 text-[11px] sm:text-xs font-semibold tracking-[0.35em] text-gold-400 uppercase">
          Taxi Service
        </p>
        {tagline && (
          <p className="mt-2 text-sm text-slate-400">{tagline}</p>
        )}
      </div>

      <div className="h-[2px] bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
    </div>
  );
}
