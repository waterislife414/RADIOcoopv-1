import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import { SUBSCRIPTION_TIERS } from "../config/constants";

function PlanCard({ tierKey, tier, highlight }) {
  // Signed-in riders go straight to checkout; everyone else signs up first.
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
          Most Popular
        </p>
      )}
      <h2
        className={`font-display font-bold text-2xl mb-1 relative ${
          highlight ? "text-white" : "text-slate-800"
        }`}
      >
        {tier.name}
      </h2>
      <p
        className={`text-3xl font-display font-bold mb-4 relative ${
          highlight ? "text-gold-300" : "text-blue-600"
        }`}
      >
        ${tier.monthlyPrice}
        <span className="text-base font-medium">/mo</span>
      </p>

      <ul
        className={`space-y-2 mb-6 text-base relative ${
          highlight ? "text-slate-200" : "text-slate-600"
        }`}
      >
        <li className="flex gap-2">
          <span>&#10003;</span>
          <span>
            1 free entry fee every {tier.ridesForFreeEntry} completed rides
          </span>
        </li>
        {tier.perks.freeMilePer10Rides && (
          <li className="flex gap-2">
            <span>&#10003;</span>
            <span>Plus 1 free mile on that same free ride</span>
          </li>
        )}
        <li className="flex gap-2">
          <span>&#10003;</span>
          <span>Live ride status updates from dispatch</span>
        </li>
        <li className="flex gap-2">
          <span>&#10003;</span>
          <span>In-app wallet for easy repeat booking</span>
        </li>
      </ul>

      <Link
        to={currentUser ? `/subscribe/${tierKey}` : `/sign-up?tier=${tierKey}`}
        className={`shine-sweep block w-full text-center font-bold text-lg py-4 rounded-full transition hover:-translate-y-0.5 duration-200 relative ${
          highlight
            ? "bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-luxury"
            : "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
        }`}
      >
        Choose {tier.name}
      </Link>
    </div>
  );
}

export default function ChoosePlan() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Membership Plans" />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-2 text-center">
            Start Earning Free Rides
          </h1>
          <p className="text-slate-500 text-base mb-8 text-center">
            Pick the plan that fits how often you ride.
          </p>

          <div className="space-y-5">
            <PlanCard tierKey="PREMIUM" tier={SUBSCRIPTION_TIERS.PREMIUM} highlight />
            <PlanCard tierKey="BASIC" tier={SUBSCRIPTION_TIERS.BASIC} />
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
