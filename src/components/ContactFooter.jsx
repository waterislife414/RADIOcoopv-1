import {
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  OFFICE_ADDRESS,
  OFFICE_MAP_LINK,
  SERVICE_HOURS,
} from "../config/constants";

export default function ContactFooter() {
  return (
    <div className="mt-10 border-t-2 border-slate-200 pt-6 text-center text-base text-slate-500 space-y-1.5">
      <p className="font-bold text-blue-600">{SERVICE_HOURS}</p>
      <a href={`tel:${COMPANY_PHONE_TEL}`} className="block hover:text-blue-600 font-medium">
        {COMPANY_PHONE_DISPLAY}
      </a>
      <a
        href={OFFICE_MAP_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:text-blue-600"
      >
        {OFFICE_ADDRESS}
      </a>
    </div>
  );
}
