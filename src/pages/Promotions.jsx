import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import {
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  PROMO_CODES,
  SUBSCRIPTION_TRIAL_DAYS,
} from "../config/constants";

function Promo({ eyebrow, title, children, to, cta, tone = "gold" }) {
  const ring = tone === "gold" ? "border-gold-400 bg-amber-50" : tone === "blue" ? "border-blue-500 bg-blue-50" : "border-emerald-500 bg-emerald-50";
  return (
    <div className={`rounded-3xl border-2 p-5 ${ring}`}>
      <p className="text-xs font-extrabold tracking-[0.25em] uppercase text-slate-700">{eyebrow}</p>
      <p className="font-display text-2xl font-bold text-slate-900 mt-1">{title}</p>
      <div className="text-slate-700 mt-2 space-y-1">{children}</div>
      {to && (
        <Link to={to} className="mt-4 block text-center rounded-full bg-navy-950 text-white font-bold py-3">
          {cta}
        </Link>
      )}
    </div>
  );
}

/** Everything currently on offer, built from the settings so it never goes stale. */
export default function Promotions() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Promotions" />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto space-y-4">
          <h1 className="text-3xl font-display font-semibold text-slate-800">Current Promotions</h1>

          <Promo eyebrow="Membership" title={`Try it free for ${SUBSCRIPTION_TRIAL_DAYS} days`} to="/join" cta="See Membership Plans">
            <p>
              Basic $9.99/mo or $109.89/yr, Premium $19.99/mo or $219.89/yr (1 month free). Unlock in-app wallet, driver alerts, live map tracking, and Priority Day Passes.
            </p>
          </Promo>

          <Promo eyebrow="Refer a friend" title={`$${PROMO_CODES.REFERRAL_BONUS} ride credit`} to="/profile" cta="Get My Referral Code" tone="green">
            <p>Share your referral code. When your friend becomes a member, you get ${PROMO_CODES.REFERRAL_BONUS} toward your next ride.</p>
          </Promo>

          <Promo eyebrow="Free account" title="Lower card fee" to="/sign-up" cta="Sign Up Free" tone="blue">
            <p>Riders with a free account pay a lower card fee, get their name and number filled in, and get deals and offers.</p>
          </Promo>

          <Promo eyebrow="In a hurry?" title="Priority Day Pass, $5" to="/trip-details" cta="Book with the Day Pass">
            <p>Skip the line all day, live driver updates and access to call your driver. Good until midnight.</p>
          </Promo>

          <div className="rounded-2xl bg-slate-50 p-5 text-center">
            <p className="font-bold text-slate-800">Commuter or business account?</p>
            <p className="text-slate-600 mt-1">Ask about weekly rates and scheduled pickups.</p>
            <a href={`tel:${COMPANY_PHONE_TEL}`} className="mt-3 inline-block font-mono font-bold text-blue-700 text-lg">
              {COMPANY_PHONE_DISPLAY}
            </a>
          </div>
          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
