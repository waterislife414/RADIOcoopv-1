import { Link } from "react-router-dom";
import CurrentRideStatus from "../components/CurrentRideStatus";
import { useAuth } from "../context/AuthContext";
import {
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  OFFICE_ADDRESS,
  OFFICE_MAP_LINK,
  LOCAL_SERVICE_CITIES,
  SURROUNDING_SERVICE_CITIES,
  COMPANY_WORDMARK,
  COMPANY_NAME,
  COPY,
} from "../config/constants";
import { calcSavings } from "../config/fareCalc";

const money = (n) => `$${n.toFixed(2)}`;

// The home page does three jobs, in this order: book a ride, call us, and a
// few reasons to choose us. Every detail lives one tap away (Compare,
// Promotions, Help, About) so this page stays short and easy to read.

function AvailableBadge() {
  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="relative flex h-2.5 w-2.5">
        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </span>
      <span className="text-sm font-bold tracking-[0.15em] text-emerald-300 uppercase">Open now &middot; 24/7</span>
    </div>
  );
}

/** Uber/Lyft comparison: one headline and three bars for a 3-mile trip. */
function CompareCard() {
  const r = calcSavings(3);
  const rows = [
    { label: COMPANY_NAME, v: r.ours, bar: "bg-gradient-to-r from-gold-400 to-gold-300", text: "text-gold-200" },
    { label: "Uber/Lyft", v: r.theirs, bar: "bg-slate-400", text: "text-slate-200" },
    { label: "Uber/Lyft, busy times", v: r.theirsBusy, bar: "bg-rose-400", text: "text-rose-200" },
  ];
  return (
    <Link to="/compare" className="block rounded-3xl p-[2px] bg-gradient-to-br from-emerald-400 via-gold-300 to-rose-400 shadow-luxury">
      <div className="rounded-[22px] bg-navy-950 px-5 py-5">
        <p className="font-display text-2xl font-bold text-white leading-tight">
          No surge. <span className="text-gold-300">No booking fee.</span>
        </p>
        <p className="text-sm text-slate-300 mt-1">A 3-mile ride:</p>
        <div className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className={`flex justify-between text-base font-semibold ${row.text}`}>
                <span>{row.label}</span>
                <span className="font-mono">{money(row.v)}</span>
              </div>
              <div className="h-3 mt-1 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${(row.v / r.theirsBusy) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center font-bold text-emerald-300">Compare prices &rarr;</p>
      </div>
    </Link>
  );
}

export default function Home() {
  const { currentUser, userProfile } = useAuth();
  const signedIn = !!(currentUser && userProfile);
  const big = "shine-sweep block text-center font-extrabold rounded-full shadow-luxury transition hover:-translate-y-0.5";

  return (
    <div className="min-h-screen flex flex-col bg-navy-950 text-white relative">
      <img src="/images/hero-fleet.jpg" alt="" aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 w-full h-full object-cover object-[72%_center]" />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-navy-950/15" />
      <div className="relative z-10 flex flex-col flex-1 pb-12">
        {/* A ride on the way comes first. */}
        {signedIn && (
          <div className="px-4 pt-4 max-w-md mx-auto w-full text-slate-800 empty:hidden">
            <CurrentRideStatus />
            {userProfile.feesOwedCents > 0 && (
              <p className="rounded-xl bg-red-50 border-2 border-red-300 text-red-800 p-3 text-sm font-semibold mb-4">
                You owe ${(userProfile.feesOwedCents / 100).toFixed(2)} in cancel or no-show fees. It&rsquo;s added to your next card payment.
              </p>
            )}
          </div>
        )}
        {/* 1. Who we are */}
        <div className="relative">
          <div className="relative px-6 pt-8 pb-4 max-w-md mx-auto text-center">
            <div className="flex justify-between items-center pr-12 animate-fade-up">
              <AvailableBadge />
              {signedIn && (
                <Link to="/profile" className="text-sm font-semibold text-slate-200 hover:text-gold-300">
                  My Account
                </Link>
              )}
            </div>
            <h1 className="mt-6 font-display font-bold text-5xl sm:text-6xl tracking-tight text-chrome-gold leading-[0.95] animate-fade-up drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              {COMPANY_WORDMARK}
            </h1>
            <p className="mt-2 text-sm font-bold tracking-[0.4em] text-white/75 uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">Taxi Service</p>
            <p className="mt-5 font-display italic font-bold text-3xl text-white leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" data-testid="motto">
              {COPY.motto.split("?")[0]}?{" "}
              <span className="not-italic font-extrabold text-chrome-gold whitespace-nowrap">{COPY.motto.split("?").slice(1).join("?").trim()}</span>
            </p>
          </div>
        </div>

        <div aria-hidden="true" className="h-[40vh]" />

        <div className="px-6 pb-8 max-w-md mx-auto w-full space-y-4">
          {/* 2. Book */}
          {signedIn ? (
            <Link to="/trip-details" className={`${big} bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 text-2xl py-5 ring-4 ring-gold-400/25`}>
              Book a Ride &rarr;
            </Link>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Link to="/sign-in" className={`${big} bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 text-xl py-5 ring-4 ring-gold-400/25`}>
                  Log In
                </Link>
                <Link to="/sign-up" className={`${big} bg-gradient-to-b from-white to-slate-200 text-navy-950 text-xl py-5 ring-4 ring-white/15`}>
                  Sign Up
                </Link>
              </div>
              <Link to="/trip-details" className="block text-center border-2 border-white/50 hover:bg-white/[0.06] text-white font-bold text-xl py-4 rounded-full">
                Continue as Guest
              </Link>
            </>
          )}

          {/* 3. Call */}
          <a href={`tel:${COMPANY_PHONE_TEL}`} className="flex items-center justify-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xl min-h-[60px]">
            &#9742; Call {COMPANY_PHONE_DISPLAY}
          </a>

          {/* 4. Members */}
          <div className="rounded-3xl border-2 border-gold-400/60 bg-gold-400/[0.10] p-5 text-center">
            <p className="font-display text-2xl font-bold text-white leading-tight">{COPY.memberPitchHeading}</p>
            <Link to="/join" className="shine-sweep mt-4 block bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 text-navy-950 font-extrabold text-lg py-3.5 rounded-full">
              &#9733; Become a Member
            </Link>
            <Link to="/promotions" className="mt-3 block text-gold-200 font-bold underline underline-offset-4">
              Check to see what promotions are available &rarr;
            </Link>
          </div>

          {/* 5. Price */}
          <CompareCard />

          {/* 6. Commuters */}
          <div className="rounded-3xl border-2 border-blue-400/50 bg-blue-500/[0.08] p-5 text-center">
            <p className="font-display font-bold text-2xl leading-snug">Need a ride to work every day?</p>
            <p className="text-slate-200 mt-1">Scheduled pickups, the same driver, weekly rates.</p>
            <a href={`tel:${COMPANY_PHONE_TEL}`} className="mt-3 inline-block font-bold text-blue-200 underline underline-offset-4">
              Call to set it up &rarr;
            </a>
          </div>

          {/* 7. Where */}
          <div className="rounded-3xl border border-white/15 bg-white/[0.04] p-5 text-center">
            <p className="text-sm font-bold tracking-[0.2em] text-gold-400 uppercase">Where we go</p>
            <p className="mt-2 text-lg font-bold">{LOCAL_SERVICE_CITIES.join(" · ")}</p>
            <p className="mt-1 text-slate-300">and {SURROUNDING_SERVICE_CITIES.join(", ")}</p>
            <a href={`tel:${COMPANY_PHONE_TEL}`} className="mt-3 inline-block font-bold text-gold-200 underline underline-offset-4">
              Going farther? Call for a price &rarr;
            </a>
          </div>
        </div>

        {/* 8. Footer */}
        <footer className="mt-auto border-t border-gold-400/20 pt-8 pb-6 px-4 text-center">
          <a href={OFFICE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="block text-slate-300 hover:text-gold-300 py-1">
            {OFFICE_ADDRESS}
          </a>
          <div className="max-w-md mx-auto flex flex-wrap justify-center gap-2.5 mt-5">
            {[
              ["/help", "Help"],
              ["/contact", "Contact Us"],
              ["/about", "About Us"],
              ["/careers", "Careers"],
              ["/terms", "Terms"],
              ["/privacy", "Privacy"],
            ].map(([to, label]) => (
              <Link key={to} to={to} className="text-sm font-bold text-white border border-white/20 hover:bg-white/[0.1] rounded-full px-4 py-2.5">
                {label}
              </Link>
            ))}
          </div>
          <Link to="/become-a-driver" className="mt-6 max-w-md mx-auto block rounded-2xl border-2 border-gold-400/50 bg-gold-400/[0.08] text-gold-200 font-extrabold text-lg py-4">
            Drive with us &mdash; Come Join Our Team &rarr;
          </Link>
          <Link to="/admin/login" className="mt-6 inline-block text-sm text-slate-400 hover:text-slate-200">
            {COPY.dispatcherFooterLabel}
          </Link>
        </footer>
      </div>
    </div>
  );
}
