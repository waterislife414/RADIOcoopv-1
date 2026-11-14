import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import {
  COMPANY_NAME, COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL, OFFICE_ADDRESS, OFFICE_MAP_LINK,
  SERVICE_HOURS, LOCAL_SERVICE_CITIES, SURROUNDING_SERVICE_CITIES, COPY,
} from "../config/constants";

const list = (v) => (Array.isArray(v) ? v.join(" · ") : v);

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="About Us" />
      <div className="px-6 py-10">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.3em] text-blue-800 uppercase">About Us</p>
            <h1 className="font-display text-3xl sm:text-4xl italic text-slate-700 mt-3">{COPY.aboutQuote || COMPANY_NAME}</h1>
            <div className="h-0.5 w-16 bg-gold-400 mx-auto my-5" />
            <p className="text-lg text-slate-600 leading-relaxed">{COPY.aboutBody}</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border-2 border-slate-200 p-5">
              <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1">Where we serve</p>
              <p className="font-bold text-slate-800">{list(LOCAL_SERVICE_CITIES)}</p>
              <p className="text-slate-600 mt-2">{list(SURROUNDING_SERVICE_CITIES)}</p>
            </div>
            <div className="rounded-2xl border-2 border-slate-200 p-5">
              <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1">Find us</p>
              <p className="font-bold text-slate-800">{SERVICE_HOURS}</p>
              <a href={OFFICE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="block text-blue-700 underline mt-2">
                {OFFICE_ADDRESS}
              </a>
              <a href={`tel:${COMPANY_PHONE_TEL}`} className="block text-blue-700 underline mt-1">
                {COMPANY_PHONE_DISPLAY}
              </a>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/trip-details" className="text-center rounded-xl py-3.5 font-bold bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950">
              Book a Ride
            </Link>
            <Link to="/become-a-driver" className="text-center rounded-xl py-3.5 font-bold border-2 border-navy-950 text-navy-950">
              Apply to Drive
            </Link>
          </div>
        </div>
      </div>
      <ContactFooter />
    </div>
  );
}
