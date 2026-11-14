import { Link } from "react-router-dom";
import {
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  OFFICE_ADDRESS,
  OFFICE_MAP_LINK,
  SERVICE_HOURS,
} from "../config/constants";

export default function ContactFooter() {
  return (
    <div className="mt-10 border-t-2 border-slate-200 pt-6 text-center text-base text-slate-600 space-y-2">
      <p className="font-bold text-blue-700">{SERVICE_HOURS}</p>
      <a
        href={`tel:${COMPANY_PHONE_TEL}`}
        className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full bg-blue-600 text-white text-lg font-bold"
      >
        &#9742; Call {COMPANY_PHONE_DISPLAY}
      </a>
      <a href={OFFICE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="block py-2 underline underline-offset-2 hover:text-blue-700">
        {OFFICE_ADDRESS}
      </a>
      <Link to="/help" className="block py-2 font-semibold text-blue-700 underline underline-offset-2">
        Help &amp; questions
      </Link>
    </div>
  );
}
