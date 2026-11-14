import { useLocation } from "react-router-dom";
import { COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL, COPY } from "../config/constants";

// The live driver screen and the dispatch desk are working tools, so the
// advertising strip stays off them; every other page gets one at the very
// top and one at the very bottom.
const hidden = (path) =>
  path.startsWith("/admin") || (path.startsWith("/driver") && path !== "/driver/sign-in" && path !== "/driver-agreement");

/** Scrolling "Advertise your business here" strip, moving left to right. */
export default function AdStrip({ position = "top" }) {
  const { pathname } = useLocation();
  if (hidden(pathname)) return null;
  const item = (
    <span className="inline-flex items-center gap-3 px-6 whitespace-nowrap">
      <span aria-hidden="true">&#9733;</span>
      <span>{COPY.adStripText}</span>
      <span className="font-mono font-bold text-white">{COMPANY_PHONE_DISPLAY}</span>
    </span>
  );
  return (
    <a
      href={`tel:${COMPANY_PHONE_TEL}`}
      data-testid={`ad-strip-${position}`}
      aria-label={`${COPY.adStripText} ${COMPANY_PHONE_DISPLAY}`}
      className={`block overflow-hidden bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 text-navy-950 text-sm font-bold h-8 leading-8 ${position === "top" ? "border-b" : "border-t"} border-navy-950/20`}
    >
      <div className="ad-marquee inline-flex" aria-hidden="true">
        {item}{item}{item}{item}
        {item}{item}{item}{item}
      </div>
    </a>
  );
}
