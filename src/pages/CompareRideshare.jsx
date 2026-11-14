import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import { COMPANY_NAME, FARE_CONFIG } from "../config/constants";
import {
  calcSavings,
  RIDESHARE_MEDIAN,
  RIDESHARE_SOURCES,
  RIDESHARE_SURGE,
  MINUTES_PER_MILE,
} from "../config/fareCalc";

const TRIP_EXAMPLES = [
  { label: "Quick Hop", miles: 2 },
  { label: "Across Town", miles: 3 },
  { label: "Medium Trip", miles: 10 },
  { label: "Long Trip", miles: 25 },
];

const money = (n) => `$${n.toFixed(2)}`;

function Bar({ label, amount, max, tone }) {
  return (
    <div>
      <div className="flex justify-between text-sm font-semibold mb-1">
        <span className={tone === "us" ? "text-navy-950" : "text-slate-600"}>{label}</span>
        <span className={tone === "us" ? "text-emerald-700 font-bold" : "text-slate-700"}>{money(amount)}</span>
      </div>
      <div className="h-3.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${tone === "us" ? "bg-gradient-to-r from-gold-400 to-gold-500" : tone === "busy" ? "bg-rose-400" : "bg-slate-400"}`}
          style={{ width: `${Math.max(6, (amount / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function TripCard({ label, miles }) {
  const r = calcSavings(miles);
  const max = Math.max(r.ours, r.theirsBusy);
  const badge =
    r.savings > 0.005
      ? { text: `Save ${money(r.savings)}`, cls: "bg-emerald-600 text-white" }
      : r.busySavings > 0.005
        ? { text: `Save ${money(r.busySavings)} at busy times`, cls: "bg-amber-500 text-navy-950" }
        : null;
  return (
    <div className="rounded-3xl border-2 border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-display font-bold text-xl text-slate-800">{label}</p>
          <p className="text-sm text-slate-500">{miles} miles &middot; about {miles * MINUTES_PER_MILE} min</p>
        </div>
        {badge && <span className={`text-xs font-extrabold rounded-full px-3 py-1.5 ${badge.cls}`}>{badge.text}</span>}
      </div>
      <div className="space-y-3">
        <Bar label={COMPANY_NAME} amount={r.ours} max={max} tone="us" />
        <Bar label="Uber/Lyft average" amount={r.theirs} max={max} tone="them" />
        <Bar label={`Uber/Lyft busy times (${RIDESHARE_SURGE.multiplier}×)`} amount={r.theirsBusy} max={max} tone="busy" />
      </div>
    </div>
  );
}

export default function CompareRideshare() {
  const m = RIDESHARE_MEDIAN;
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Compare Rates" />

      <div className="bg-navy-950 text-white px-6 pb-10 pt-2">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs font-bold tracking-[0.3em] text-gold-400 uppercase">{COMPANY_NAME} vs. Uber &amp; Lyft</p>
          <h1 className="font-display text-4xl font-bold mt-2 leading-tight">
            No surge.
            <span className="block text-gold-300 italic">No booking fee. Ever.</span>
          </h1>
          <div className="grid grid-cols-2 gap-3 mt-7 text-left">
            <div className="rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 p-4">
              <p className="text-[11px] font-extrabold tracking-widest uppercase">Our meter</p>
              <p className="font-mono text-2xl font-bold mt-1">{money(FARE_CONFIG.PER_MILE)}<span className="text-sm">/mi</span></p>
              <p className="text-xs mt-1 font-semibold">{money(FARE_CONFIG.BASE_FARE)} to start &middot; $0 booking fee &middot; same rate at 3 AM or rush hour</p>
            </div>
            <div className="rounded-2xl bg-white/[0.08] border border-white/15 p-4">
              <p className="text-[11px] font-extrabold tracking-widest uppercase text-slate-300">Uber/Lyft central average</p>
              <p className="font-mono text-2xl font-bold mt-1">{money(m.perMile)}<span className="text-sm">/mi</span></p>
              <p className="text-xs mt-1 text-slate-300">+ {money(m.perMin)}/min + {money(m.base)} base + {money(m.booking)} booking fee &middot; then surge on top</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-8">
        <div className="max-w-md mx-auto space-y-4">
          {TRIP_EXAMPLES.map((t) => (
            <TripCard key={t.miles} {...t} />
          ))}

          <Link
            to="/trip-details"
            className="block text-center bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-extrabold text-lg py-4 rounded-full shadow-luxury"
          >
            Book a Ride &rarr;
          </Link>

          <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 space-y-3">
            <p className="font-bold text-slate-800">How we got these numbers</p>
            <p>
              The Uber/Lyft &ldquo;central average&rdquo; is the <strong>median</strong> of each part of the fare
              (base, per mile, per minute, booking fee) across the published national averages below, at normal
              (no-surge) prices, assuming about {MINUTES_PER_MILE} minutes per mile. &ldquo;Busy times&rdquo; applies a{" "}
              {RIDESHARE_SURGE.multiplier}&times; surge, typical for rain, rush hour and events.
            </p>
            <p>
              {COMPANY_NAME} prices are cash meter fares for one passenger. Card payments add a {money(FARE_CONFIG.CARD_APP_FEE)} app fee
              ({money(FARE_CONFIG.CARD_APP_FEE_MEMBER)} for members). Your actual fare is set by the cab meter; Uber and
              Lyft prices vary by city, time and demand, and are not Columbus quotes.
            </p>
            <ul className="space-y-1.5">
              {RIDESHARE_SOURCES.map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                    {s.name}
                  </a>
                </li>
              ))}
              <li>
                <a href={RIDESHARE_SURGE.source} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                  RideWise: How Uber &amp; Lyft surge pricing works (2026)
                </a>
              </li>
            </ul>
            <p className="text-xs text-slate-400">Sources checked November 2026.</p>
          </div>

          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
