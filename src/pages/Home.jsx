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
  COPY,
  BRAND,
} from "../config/constants";

function AvailableBadge() {
  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="relative flex h-2 w-2">
        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
      </span>
      <span className="text-xs font-semibold tracking-[0.2em] text-gold-300/90 uppercase">
        Available now
      </span>
    </div>
  );
}

export default function Home() {
  const { currentUser, userProfile } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-navy-950">
      {/* Hero — top portion has the fleet photo as a backdrop with a dark
          gradient mask so the wordmark/tagline stay razor-sharp; buttons
          live on solid navy below so they're always perfectly legible and
          tappable regardless of what's happening in the photo underneath. */}
      <div className="relative overflow-hidden">
        <img
          src="/images/hero-fleet.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950/95 via-navy-950/80 to-navy-950" />
        <div className="absolute -top-40 -right-32 h-96 w-96 rounded-full bg-blue-600/25 blur-[100px]" />
        <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-gold-500/[0.10] blur-[100px]" />

        <div className="relative px-6 pt-10 max-w-md mx-auto">
          <div className="flex justify-between items-center mb-8 animate-fade-up">
            <AvailableBadge />
            {currentUser && userProfile && (
              <Link
                to="/profile"
                className="text-xs font-semibold tracking-wide text-slate-300 hover:text-gold-300 uppercase"
              >
                My Account
              </Link>
            )}
          </div>

          <div
            className="text-center mb-2 animate-fade-up"
            style={{ animationDelay: "80ms" }}
          >
            <h1 className="font-display font-bold text-5xl sm:text-6xl tracking-tight text-chrome-gold leading-[0.95]">
              {COMPANY_WORDMARK}
            </h1>
            <p className="mt-2 text-sm font-bold tracking-[0.4em] text-white/70 uppercase">
              Taxi Service
            </p>
          </div>

          <div className="ambient-bar mt-5 mx-auto max-w-[220px] animate-fade-up" style={{ animationDelay: "140ms" }} />

          <div className="mt-8 text-center animate-fade-up" style={{ animationDelay: "200ms" }}>
            <p className="text-base font-medium tracking-[0.25em] text-gold-400/80 uppercase mb-3">
              {COPY.heroEyebrow}
            </p>
            <h2 className="font-display font-medium text-4xl sm:text-[2.75rem] leading-[1.1] text-white">
              {COPY.heroHeadingLine1}
              <span className="block italic text-gold-300">{COPY.heroHeadingLine2}</span>
            </h2>
            <p className="mt-5 text-slate-300 text-lg leading-relaxed font-light">
              {COPY.heroSubtext}
            </p>
          </div>
        </div>
      </div>

      {/* Solid navy below the photo — buttons/stats always stay perfectly
          legible and tappable regardless of what's in the image above. */}
      <div className="relative overflow-hidden bg-navy-950 bg-grain">
        <div className="relative px-6 pb-10 max-w-md mx-auto">
          <div className="mt-10 space-y-3.5 animate-fade-up" style={{ animationDelay: "260ms" }}>
            <Link
              to="/sign-in"
              className="shine-sweep block w-full text-center bg-gradient-to-b from-gold-300 to-gold-500 hover:from-gold-300 hover:to-gold-400 text-navy-950 font-bold text-lg py-4.5 rounded-full shadow-luxury transition hover:-translate-y-0.5 duration-200"
            >
              Create Account / Sign In
            </Link>
            <Link
              to="/trip-details"
              className="block w-full text-center border-2 border-white/20 hover:border-white/40 hover:bg-white/[0.05] text-white font-semibold text-lg py-4.5 rounded-full transition hover:-translate-y-0.5 duration-200"
            >
              Continue as Guest
            </Link>
          </div>

          <Link
            to="/join"
            className="shine-sweep mt-5 block w-full text-center bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 text-navy-950 font-bold text-base py-4 rounded-full shadow-luxury border-2 border-gold-200/50 transition hover:-translate-y-0.5 duration-200 animate-fade-up"
            style={{ backgroundSize: "200% auto", animationDelay: "320ms" }}
          >
            &#9733; Become a Member &mdash; Start Earning Free Perks Today!
          </Link>

          <Link
            to="/compare"
            className="mt-4 block w-full text-center bg-white border-2 border-emerald-500 text-emerald-700 font-bold text-base py-4 rounded-full transition hover:-translate-y-0.5 animate-fade-up"
            style={{ animationDelay: "340ms" }}
          >
            Compare to Uber, Lyft &amp; Other Rideshare &rarr;
          </Link>

          <div
            className="mt-4 glass-panel border-2 border-blue-400/30 rounded-2xl p-5 text-center animate-fade-up"
            style={{ animationDelay: "360ms" }}
          >
            <p className="font-display font-bold text-lg text-white leading-snug">
              Need a Reliable Ride to Work, Every Day?
            </p>
            <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
              Ask about weekly commuter routes &mdash; the same driver, the
              same time, every day. Call {COMPANY_PHONE_DISPLAY} to set yours up.
            </p>
          </div>

          <div className="mt-12 pt-7 border-t border-gold-400/20">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-mono text-2xl font-semibold text-white tabular-nums">
                  24/7
                </p>
                <p className="text-xs tracking-widest text-slate-400 uppercase mt-1">
                  Hours
                </p>
              </div>
              <div className="border-x border-white/10">
                <p className="text-lg font-display font-semibold text-white leading-tight px-1">
                  {BRAND.serviceArea.statsAreaLabel}
                </p>
                <p className="text-xs tracking-widest text-slate-400 uppercase mt-1">
                  Service Area
                </p>
              </div>
              <div>
                <p className="font-mono text-lg font-semibold text-white tabular-nums">
                  {COMPANY_PHONE_DISPLAY}
                </p>
                <p className="text-xs tracking-widest text-slate-400 uppercase mt-1">
                  Dispatch
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Service area notice — glass HUD panel */}
      <div className="px-6 pb-2">
        <div className="max-w-md mx-auto glass-panel border-2 border-gold-400/30 rounded-2xl p-6">
          <p className="text-sm font-bold tracking-[0.25em] text-gold-400 uppercase mb-4 text-center">
            Where We Serve
          </p>

          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1.5">
            Local Service Area
          </p>
          <p className="text-xl font-display font-bold text-white mb-4 leading-snug">
            {LOCAL_SERVICE_CITIES.join(" · ")}
          </p>

          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1.5">
            Surrounding Areas
          </p>
          <p className="text-xl font-display font-bold text-white mb-4 leading-snug">
            {SURROUNDING_SERVICE_CITIES.join(" · ")}
          </p>

          <div className="border-t border-gold-400/20 pt-4">
            <p className="text-base text-gold-200 font-semibold text-center leading-relaxed">
              Surrounding areas: call for pricing.
              <br />
              ${OUT_OF_AREA_MINIMUM_FARE.toFixed(0)} minimum fare applies.
            </p>
          </div>
        </div>
      </div>

      {/* About — warm panel, not stark white */}
      <div className="bg-gradient-to-b from-[#FBF8F1] to-[#F4EEE0] px-6 py-16 mt-6">
        <div className="max-w-md mx-auto text-center">
          <p className="text-sm font-bold tracking-[0.3em] text-blue-700 uppercase mb-4">
            About Us
          </p>
          <p className="font-display italic text-3xl leading-snug text-slate-800">
            &ldquo;{COPY.aboutQuote}&rdquo;
          </p>
          <div className="w-16 h-[2px] bg-gold-500 mx-auto my-5" />
          <p className="text-slate-600 text-lg leading-relaxed">
            {COPY.aboutBody}
          </p>
        </div>
      </div>

      {/* Contact strip — glass panel */}
      <div className="bg-navy-950 px-6 pb-6 pt-2">
        <div className="max-w-md mx-auto w-full">
          <div className="rounded-2xl glass-panel border border-gold-400/20 px-5 py-5 flex flex-col items-center gap-1.5">
            <a
              href={`tel:${COMPANY_PHONE_TEL}`}
              className="font-display font-semibold text-xl text-gold-300"
            >
              {COMPANY_PHONE_DISPLAY}
            </a>
            <a
              href={OFFICE_MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-gold-300 text-base"
            >
              {OFFICE_ADDRESS}
            </a>
          </div>
        </div>
      </div>

      <footer className="bg-navy-950 border-t border-gold-400/20 py-9 px-4">
        <div className="flex flex-wrap justify-center gap-3 mb-6">
          <Link
            to="/careers"
            className="text-base font-bold text-white glass-panel hover:bg-white/[0.12] border border-white/15 rounded-full px-6 py-3 transition"
          >
            Careers
          </Link>
          <Link
            to="/contact"
            className="text-base font-bold text-white glass-panel hover:bg-white/[0.12] border border-white/15 rounded-full px-6 py-3 transition"
          >
            Contact Us
          </Link>
          <Link
            to="/terms"
            className="text-base font-bold text-white glass-panel hover:bg-white/[0.12] border border-white/15 rounded-full px-6 py-3 transition"
          >
            Terms &amp; Privacy
          </Link>
        </div>
        <div className="flex justify-center">
          <Link
            to="/admin/login"
            className="text-sm text-slate-500 hover:text-slate-300"
          >
            {COPY.dispatcherFooterLabel}
          </Link>
        </div>
      </footer>
    </div>
  );
}
