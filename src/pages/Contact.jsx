import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import {
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  COMPANY_EMAIL,
  OFFICE_ADDRESS,
  OFFICE_MAP_LINK,
  SERVICE_HOURS,
  SERVICE_AREA,
} from "../config/constants";

export default function Contact() {
  const emailIsPlaceholder = COMPANY_EMAIL.startsWith("[INSERT");

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-1">
            Contact Us
          </h1>
          <p className="text-base font-bold text-blue-600 mb-6">{SERVICE_HOURS}</p>

          <div className="space-y-4">
            <a
              href={`tel:${COMPANY_PHONE_TEL}`}
              className="block border-2 border-slate-300 hover:border-blue-600 rounded-2xl px-5 py-5 transition"
            >
              <p className="text-sm text-slate-400 mb-1">Call</p>
              <p className="font-bold text-lg text-slate-800">{COMPANY_PHONE_DISPLAY}</p>
            </a>

            {!emailIsPlaceholder && (
              <a
                href={`mailto:${COMPANY_EMAIL}`}
                className="block border-2 border-slate-300 hover:border-blue-600 rounded-2xl px-5 py-5 transition"
              >
                <p className="text-sm text-slate-400 mb-1">Email</p>
                <p className="font-bold text-lg text-slate-800">{COMPANY_EMAIL}</p>
              </a>
            )}

            <a
              href={OFFICE_MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-2 border-slate-300 hover:border-blue-600 rounded-2xl px-5 py-5 transition"
            >
              <p className="text-sm text-slate-400 mb-1">Office</p>
              <p className="font-bold text-lg text-slate-800">{OFFICE_ADDRESS}</p>
            </a>

            <div className="border-2 border-slate-200 rounded-2xl px-5 py-5">
              <p className="text-sm text-slate-400 mb-1">Service Area</p>
              <p className="text-base text-slate-600">{SERVICE_AREA}</p>
            </div>
          </div>

          <Link to="/" className="inline-block mt-8 text-blue-600 text-base font-semibold">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
