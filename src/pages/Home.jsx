import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  OFFICE_ADDRESS,
  OFFICE_MAP_LINK,
  LOCAL_SERVICE_CITIES,
  SURROUNDING_SERVICE_CITIES,
  OUT_OF_AREA_MINIMUM_FARE,
  COMPANY_WORDMARK,
  COMPANY_NAME,
  COPY,
  BRAND,
} from "../config/constants";
import { calcSavings, RIDESHARE_SURGE } from "../config/fareCalc";

function AvailableBadge() {
  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="relative flex h-2 w-2">
        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
      </span>
      <span className="text-xs font-semibold tracking-[0.2em] text-gold-300/90 uppercase">Available now &middot; 24/7</span>
    </div>
  );
}

const money = (n) => `$${n.toFixed(2)}`;

/** Eye-catching Uber/Lyft comparison: a 3-mile trip, ours vs the national median. */
function CompareTeaser() {
  const miles = 3;
  const r = calcSavings(miles);
  const max = r.theirsBusy;
  const rows = [
    { label: COMPANY_NAME, v: r.ours, cls: "bg-gradient-to-r from-gold-400 to-gold-300", text: "text-gold-200" },
    { label: "Uber/Lyft average", v: r.theirs, cls: "bg-slate-400", text: "text-slate-300" },
    { label: `Uber/Lyft busy times`, v: r.theirsBusy, cls: "bg-rose-400", text: "text-rose-200" },
  ];
  return (
    <Link
      to="/compare"
      className="mt-5 block rounded-3xl p-[2px] bg-gradient-to-br from-emerald-400 via-gold-300 to-rose-400 shadow-luxury animate-fade-up transition hover:-translate-y-0.5"
      style={{ animationDelay: "340ms" }}
    >
      <div className="rounded-[22px] bg-navy-950 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.25em] text-emerald-300 uppercase">Compare to Uber &amp; Lyft</p>
            <p className="font-display text-2xl font-bold text-white leading-tight mt-1">
              No surge. <span className="text-gold-300">No booking fee.</span>
            </p>
          </div>
          {r.savings > 0 && (
            <span className="shrink-0 rounded-2xl bg-emerald-500 text-navy-950 text-center px-3 py-2 leading-none">
              <span className="block text-[10px] font-extrabold uppercase">Save</span>
              <span className="block font-mono text-lg font-bold">{money(r.savings)}</span>
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">A {miles}-mile trip, cash fare vs. the national average:</p>
        <div className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className={`flex justify-between text-sm font-semibold ${row.text}`}>
                <span>{row.label}</span>
                <span className="font-mono">{money(row.v)}</span>
              </div>
              <div className="h-2.5 mt-1 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${row.cls}`} style={{ width: `${(row.v / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm font-bold text-emerald-300">
          See every trip &amp; our sources &rarr;
        </p>
        <p className="text-[10px] text-slate-500 text-center mt-1">Busy times = {RIDESHARE_SURGE.multiplier}&times; surge. Estimates; your meter sets the fare.</p>
      </div>
    </Link>
  );
}

export default function Home() {
  const { currentUser, userProfile } = useAuth();
  const signedIn = !!(currentUser && userProfile);

  return (
    <div className="min-h-screen flex flex-col bg-navy-950">
      {/* Hero: name, phone, then the main buttons right away. */}
      <div className="relative overflow-hidden">
        <img
          src="/images/hero-fleet.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950/95 via-navy-950/85 to-navy-950" />
        <div className="absolute -top-40 -right-32 h-96 w-96 rounded-full bg-blue-600/25 blur-[100px]" />
        <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-gold-500/[0.10] blur-[100px]" />

        <div className="relative px-6 pt-8 pb-2 max-w-md mx-auto">
          <div className="flex justify-between items-center mb-6 pr-12 animate-fade-up">
            <AvailableBadge />
            {signedIn && (
              <Link to="/profile" className="text-xs font-semibold tracking-wide text-slate-300 hover:text-gold-300 uppercase">
                My Account
              </Link>
            )}
          </div>

          <div className="text-center animate-fade-up" style={{ animationDelay: "80ms" }}>
            <h1 className="font-display font-bold text-5xl sm:text-6xl tracking-tight text-chrome-gold leading-[0.95]">
              {COMPANY_WORDMARK}
            </h1>
            <p className="mt-2 text-sm font-bold tracking-[0.4em] text-white/70 uppercase">Taxi Service</p>
            <a href={`tel:${COMPANY_PHONE_TEL}`} className="mt-1.5 inline-block font-mono text-sm text-gold-300/90 hover:text-gold-200">
              {COMPANY_PHONE_DISPLAY}
            </a>
          </div>

          <div className="ambient-bar mt-4 mx-auto max-w-[220px] animate-fade-up" style={{ animationDelay: "140ms" }} />

          <p className="mt-5 text-center text-sm font-semibold tracking-[0.18em] text-gold-400/90 uppercase animate-fade-up" style={{ animationDelay: "180ms" }}>
            {COPY.heroEyebrow}
          </p>
          <p className="mt-1.5 text-center text-slate-300 text-base leading-relaxed animate-fade-up" style={{ animationDelay: "200ms" }}>
            {COPY.heroSubtext}
          </p>
        </div>
      </div>

      <div className="relative overflow-hidden bg-navy-950 bg-grain">
        <div className="relative px-6 pb-10 max-w-md mx-auto">
          {/* Main actions, first and biggest. */}
          <div className="mt-6 space-y-3.5 animate-fade-up" style={{ animationDelay: "240ms" }}>
            {signedIn ? (
              <Link
                to="/trip-details"
                className="shine-sweep block text-center bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-extrabold text-2xl py-5 rounded-full shadow-luxury ring-4 ring-gold-400/25 transition hover:-translate-y-0.5"
              >
                Book a Ride &rarr;
              </Link>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    to="/sign-in"
                    className="shine-sweep block text-center bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-extrabold text-xl py-5 rounded-full shadow-luxury ring-4 ring-gold-400/25 transition hover:-translate-y-0.5"
                  >
                    Log In
                  </Link>
                  <Link
                    to="/sign-up"
                    className="shine-sweep block text-center bg-gradient-to-b from-white to-slate-200 text-navy-950 font-extrabold text-xl py-5 rounded-full shadow-luxury ring-4 ring-white/15 transition hover:-translate-y-0.5"
                  >
                    Sign Up
                  </Link>
                </div>
                <Link
                  to="/trip-details"
                  className="block w-full text-center border-2 border-white/40 hover:bg-white/[0.06] text-white font-bold text-xl py-4.5 rounded-full transition hover:-translate-y-0.5"
                >
                  Continue as Guest
                </Link>
              </>
            )}
          </div>

          {/* Membership pitch, right under the log in / sign up buttons. */}
          <div className="mt-6 rounded-3xl border-2 border-gold-400/60 bg-gradient-to-b from-gold-400/[0.14] to-transparent p-5 animate-fade-up" style={{ animationDelay: "300ms" }}>
            <p className="text-[11px] font-extrabold tracking-[0.25em] text-gold-400 uppercase text-center">Members save</p>
            <p className="font-display text-2xl font-bold text-white text-center leading-tight mt-1">{COPY.memberPitchHeading}</p>
            <ul className="mt-3 space-y-1.5 text-slate-200">
              {COPY.memberPerks.map((perk) => (
                <li key={perk} className="flex gap-2.5">
                  <span className="text-gold-300">&#10003;</span>
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/join"
              className="shine-sweep mt-4 block text-center bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 text-navy-950 font-extrabold text-lg py-3.5 rounded-full shadow-luxury"
              style={{ backgroundSize: "200% auto" }}
            >
              &#9733; Become a Member
            </Link>
            <Link to="/promotions" className="mt-3 block text-center text-gold-200 font-bold underline underline-offset-4">
              Check to see what promotions are available &rarr;
            </Link>
          </div>

          <CompareTeaser />

          {/* Daily commuters */}
          <div className="mt-5 rounded-3xl glass-panel border-2 border-blue-400/40 p-5 text-center animate-fade-up" style={{ animationDelay: "360ms" }}>
            <p className="text-[11px] font-extrabold tracking-[0.25em] text-blue-300 uppercase">Commuters</p>
            <p className="font-display font-bold text-2xl text-white leading-snug mt-1">Need a reliable ride to work every day?</p>
            <ul className="mt-3 space-y-1.5 text-slate-200 text-left inline-block">
              <li>&#10003; Scheduled pickups, same time every day</li>
              <li>&#10003; Ask about our weekly rates</li>
              <li>&#10003; Keep the same driver every time &mdash; or pick a fresh driver</li>
            </ul>
            <a
              href={`tel:${COMPANY_PHONE_TEL}`}
              className="mt-4 block rounded-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-lg py-3.5"
            >
              Call {COMPANY_PHONE_DISPLAY}
            </a>
          </div>

          <div className="mt-5 rounded-3xl border border-white/15 bg-white/[0.04] p-5 text-center">
            <p className="font-display text-xl font-bold text-white">Questions or concerns?</p>
            <p className="text-slate-300 mt-1">Call now or contact us &mdash; a real person answers.</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <a href={`tel:${COMPANY_PHONE_TEL}`} className="rounded-full bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-extrabold py-3">
                Call Now
              </a>
              <Link to="/contact" className="rounded-full border-2 border-white/30 text-white font-bold py-3">
                Contact Us
              </Link>
            </div>
          </div>

          <div className="mt-10 pt-7 border-t border-gold-400/20">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-mono text-2xl font-semibold text-white tabular-nums">24/7</p>
                <p className="text-xs tracking-widest text-slate-400 uppercase mt-1">Hours</p>
              </div>
              <div className="border-x border-white/10">
                <p className="text-lg font-display font-semibold text-white leading-tight px-1">{BRAND.serviceArea.statsAreaLabel}</p>
                <p className="text-xs tracking-widest text-slate-400 uppercase mt-1">Service Area</p>
              </div>
              <div>
                <a href={`tel:${COMPANY_PHONE_TEL}`} className="block font-mono text-lg font-semibold text-white tabular-nums leading-tight">
                  {COMPANY_PHONE_DISPLAY.replace(/\)\s*/, ")\n").split("\n").map((part) => (
                    <span key={part} className="block">{part}</span>
                  ))}
                </a>
                <p className="text-xs tracking-widest text-slate-400 uppercase mt-1">Dispatch</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Where we serve */}
      <div className="px-6 pb-2">
        <div className="max-w-md mx-auto glass-panel border-2 border-gold-400/30 rounded-2xl p-6">
          <p className="text-sm font-bold tracking-[0.25em] text-gold-400 uppercase mb-4 text-center">Where We Serve</p>
          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1.5">Local Service Area</p>
          <p className="text-xl font-display font-bold text-white mb-4 leading-snug">{LOCAL_SERVICE_CITIES.join(" · ")}</p>
          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1.5">Surrounding Areas</p>
          <p className="text-xl font-display font-bold text-white mb-4 leading-snug">{SURROUNDING_SERVICE_CITIES.join(" · ")}</p>
          <div className="border-t border-gold-400/20 pt-4 text-center">
            <p className="text-base text-gold-200 font-semibold leading-relaxed">{COPY.outOfAreaNote}</p>
            <p className="text-sm text-slate-400 mt-1">${OUT_OF_AREA_MINIMUM_FARE.toFixed(0)} minimum fare applies outside the local area.</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <a href={`tel:${COMPANY_PHONE_TEL}`} className="rounded-full bg-gold-400 text-navy-950 font-bold py-3">Call for Pricing</a>
              <Link to="/trip-details" className="rounded-full border-2 border-gold-400/60 text-gold-200 font-bold py-3">Check a Price</Link>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="bg-gradient-to-b from-[#FBF8F1] to-[#F4EEE0] px-6 py-14 mt-6">
        <div className="max-w-md mx-auto text-center">
          <p className="text-sm font-bold tracking-[0.3em] text-blue-700 uppercase mb-4">About Us</p>
          <p className="font-display italic text-3xl leading-snug text-slate-800">&ldquo;{COPY.aboutQuote}&rdquo;</p>
          <div className="w-16 h-[2px] bg-gold-500 mx-auto my-5" />
          <p className="text-slate-600 text-lg leading-relaxed">{COPY.aboutBody}</p>
          <Link to="/about" className="mt-5 inline-block font-bold text-blue-700">More about us &rarr;</Link>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-navy-950 px-6 pb-6 pt-6">
        <div className="max-w-md mx-auto w-full rounded-2xl glass-panel border border-gold-400/20 px-5 py-5 flex flex-col items-center gap-1.5">
          <a href={`tel:${COMPANY_PHONE_TEL}`} className="font-display font-semibold text-2xl text-gold-300">{COMPANY_PHONE_DISPLAY}</a>
          <a href={OFFICE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-gold-300 text-base text-center">
            {OFFICE_ADDRESS}
          </a>
        </div>
      </div>

      <footer className="bg-navy-950 border-t border-gold-400/20 pt-8 pb-6 px-4">
        <div className="max-w-md mx-auto flex flex-wrap justify-center gap-2.5 mb-6">
          {[
            ["/careers", "Careers"],
            ["/contact", "Contact Us"],
            ["/terms", "Terms"],
            ["/privacy", "Privacy"],
            ["/about", "About Us"],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="text-sm font-bold text-white glass-panel hover:bg-white/[0.12] border border-white/15 rounded-full px-4 py-2.5 transition">
              {label}
            </Link>
          ))}
        </div>
        <div className="max-w-md mx-auto">
          <Link
            to="/become-a-driver"
            className="block text-center rounded-2xl border-2 border-gold-400/50 bg-gold-400/[0.08] text-gold-200 font-extrabold text-lg py-4"
          >
            Drive with us &mdash; Come Join Our Team &rarr;
          </Link>
        </div>
        <div className="flex justify-center mt-6">
          <Link to="/admin/login" className="text-sm text-slate-500 hover:text-slate-300">{COPY.dispatcherFooterLabel}</Link>
        </div>
      </footer>
    </div>
  );
}
