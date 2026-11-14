import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import {
  BRAND, COMPANY_NAME, COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL, OFFICE_ADDRESS, OFFICE_MAP_LINK,
  SERVICE_HOURS, LOCAL_SERVICE_CITIES, SURROUNDING_SERVICE_CITIES, COPY,
} from "../config/constants";

const list = (v) => (Array.isArray(v) ? v.join(" · ") : v);
const ABOUT = BRAND.about || {};

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="About Us" />

      <div className="bg-navy-950 text-white px-6 pb-12 pt-4 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="font-display text-4xl sm:text-5xl font-bold italic text-chrome-gold leading-tight">
            &ldquo;{COPY.aboutQuote || COMPANY_NAME}&rdquo;
          </p>
          {ABOUT.established && (
            <p className="mt-4 text-sm font-bold tracking-[0.25em] text-gold-300 uppercase">
              Locally owned &amp; operated since {ABOUT.established}
            </p>
          )}
          {ABOUT.owners && <p className="mt-2 text-slate-300">Owned by {ABOUT.owners}</p>}
          <div className="grid grid-cols-3 gap-3 mt-8">
            {[
              [ABOUT.established ? `Since ${ABOUT.established}` : "Local", "Columbus owned"],
              ["24/7", "Every day"],
              ["Real people", "Dispatch answers"],
            ].map(([big, small]) => (
              <div key={small} className="rounded-2xl bg-white/[0.06] border border-white/10 py-4 px-2">
                <p className="font-display text-lg font-bold text-white leading-tight">{big}</p>
                <p className="text-xs tracking-widest text-slate-300 uppercase mt-1">{small}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-10">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center">
            <p className="text-lg text-slate-600 leading-relaxed">{COPY.aboutBody}</p>
            {ABOUT.community && <p className="mt-3 text-lg font-semibold text-blue-800">{ABOUT.community}</p>}
          </div>

          {ABOUT.services?.length > 0 && (
            <div className="rounded-3xl border-2 border-gold-400/60 bg-amber-50 p-6">
              <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-3">What we do</p>
              <ul className="space-y-2">
                {ABOUT.services.map((s) => (
                  <li key={s} className="flex gap-3 text-slate-800 font-semibold">
                    <span className="text-gold-600">&#10003;</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border-2 border-slate-200 p-5">
              <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">Where we serve</p>
              <p className="font-bold text-slate-800">{list(LOCAL_SERVICE_CITIES)}</p>
              <p className="text-slate-600 mt-2">{list(SURROUNDING_SERVICE_CITIES)}</p>
              <p className="text-sm text-slate-500 mt-2">{COPY.outOfAreaNote}</p>
            </div>
            <div className="rounded-2xl border-2 border-slate-200 p-5">
              <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">Find us</p>
              <p className="font-bold text-slate-800">{SERVICE_HOURS}</p>
              <a href={OFFICE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="block text-blue-700 underline mt-2">
                {OFFICE_ADDRESS}
              </a>
              <a href={`tel:${COMPANY_PHONE_TEL}`} className="block text-blue-700 underline mt-1">
                {COMPANY_PHONE_DISPLAY}
              </a>
            </div>
          </div>

          <Link to="/trip-details" className="block text-center rounded-full py-4 text-lg font-extrabold bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-luxury">
            Book a Ride
          </Link>
        </div>
      </div>
      <ContactFooter />
    </div>
  );
}
