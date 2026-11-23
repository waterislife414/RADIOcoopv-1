import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import { BRAND, FARE_CONFIG, PROMO_CODES } from "../config/constants";

function PlanCard({ tierKey, name, price, yearlyPrice, savings, perks, highlight }) {
  const { currentUser } = useAuth();
  return (
    <div
      className={`rounded-2xl p-6 border-2 ${
        highlight
          ? "border-gold-400 bg-gradient-to-b from-navy-950 to-navy-900 bg-grain relative overflow-hidden"
          : "border-slate-200 bg-white"
      }`}
    >
      {highlight && (
        <p className="text-gold-400 text-xs font-bold tracking-widest uppercase mb-2 relative">
          Most perks
        </p>
      )}
      <h2
        className={`font-display font-bold text-2xl mb-1 relative ${
          highlight ? "text-white" : "text-slate-800"
        }`}
      >
        {name}
      </h2>
      <p
        className={`text-3xl font-display font-bold mb-1 relative ${
          highlight ? "text-gold-300" : "text-blue-600"
        }`}
      >
        ${price}
        <span className="text-base font-medium">/mo</span>
      </p>
      {yearlyPrice && (
        <p className={`text-sm mb-4 relative ${highlight ? "text-slate-300" : "text-slate-500"}`}>
          or ${yearlyPrice}/yr ({savings})
        </p>
      )}

      <ul
        className={`space-y-2 mb-6 text-base relative ${
          highlight ? "text-slate-200" : "text-slate-600"
        }`}
      >
        {perks.map((p, idx) => (
          <li key={idx} className="flex gap-2">
            <span>&#10003;</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      {tierKey ? (
        <Link
          to={currentUser ? `/subscribe/${tierKey}` : `/sign-up?tier=${tierKey}`}
          className={`shine-sweep block w-full text-center font-bold text-lg py-4 rounded-full transition hover:-translate-y-0.5 duration-200 relative ${
            highlight
              ? "bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-luxury"
              : "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
          }`}
        >
          Choose {name}
        </Link>
      ) : (
        <Link
          to="/sign-up"
          className="block w-full text-center font-bold text-lg py-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
        >
          Get Free Account
        </Link>
      )}
    </div>
  );
}

export default function ChoosePlan() {
  // Only perks the app actually gives today. Plan perks come from branding.config.json.
  const freeEntry = PROMO_CODES.FREE_ENTRY_ACTIVE ? ["A free entry fee every 10 rides over $5 (or every $50 in rides)"] : [];
  const passes = (tier) => {
    const n = Number(BRAND.pricing.tiers[tier]?.dayPassesPerMonth) || 0;
    return n ? [`${n} free Priority Day Pass${n === 1 ? "" : "es"} a month`] : [];
  };
  const perk = (key, tier) => (BRAND.ridePerks?.[key] || []).includes(tier);
  const freePerks = [
    ...(BRAND.pricing?.cardFee?.mode === "flat"
      ? [`Lower card fee ($${FARE_CONFIG.CARD_APP_FEE_MEMBER.toFixed(2)} instead of $${FARE_CONFIG.CARD_APP_FEE.toFixed(2)})`]
      : []),
    "Your name and number filled in when you book",
    ...freeEntry,
    "Deals and offers in your area",
  ];

  const basicPerks = [
    ...freePerks,
    ...(perk("liveMap", "BASIC") ? ["See your driver live on the map"] : []),
    ...passes("BASIC"),
  ];

  const premiumPerks = [
    ...freePerks,
    "Front of the line on every ride",
    ...(perk("liveMap", "PREMIUM") ? ["See your driver live on the map"] : []),
    ...(perk("callDriver", "PREMIUM") ? ["Call your driver through the app (private number)"] : []),
    // Premium already has everything a Day Pass gives, so its monthly passes aren't listed as extra.
  ];

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Membership Plans" />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-2 text-center">
            Pick your plan
          </h1>
          <p className="text-slate-500 text-base mb-8 text-center">
            Pick the plan that fits how often you ride.
          </p>

          <div className="space-y-5">
            <PlanCard
              tierKey="PREMIUM"
              name="Premium"
              price="19.99"
              yearlyPrice="219.89"
              savings="Save $19.99 a year"
              perks={premiumPerks}
              highlight
            />
            <PlanCard
              tierKey="BASIC"
              name="Basic"
              price="9.99"
              yearlyPrice="109.89"
              savings="Save $9.99 a year"
              perks={basicPerks}
            />
            <PlanCard
              name="Free (Any account)"
              price="0"
              perks={freePerks}
            />
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{" "}
            <Link to="/sign-in" className="text-blue-600 font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
