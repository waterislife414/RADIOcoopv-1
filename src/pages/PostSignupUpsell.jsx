import { Link, useNavigate } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import { SUBSCRIPTION_TIERS, SUBSCRIPTION_TRIAL_DAYS } from "../config/constants";

export default function PostSignupUpsell() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-1 text-center">
            You're In!
          </h1>
          <p className="text-slate-500 text-base mb-6 text-center">
            Want to unlock more from your account?
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Link
              to="/subscribe/BASIC"
              className="border-2 border-slate-200 rounded-2xl p-4 text-center hover:border-blue-400 transition"
            >
              <p className="font-display font-bold text-lg text-slate-800">Basic</p>
              <p className="text-2xl font-bold text-slate-800 my-1">
                ${SUBSCRIPTION_TIERS.BASIC.monthlyPrice}
                <span className="text-sm font-normal text-slate-400">/mo</span>
              </p>
              <p className="text-xs text-slate-500 leading-snug">
                1 free entry fee every {SUBSCRIPTION_TIERS.BASIC.ridesForFreeEntry} rides
              </p>
            </Link>
            <Link
              to="/subscribe/PREMIUM"
              className="border-2 border-gold-400 bg-amber-50 rounded-2xl p-4 text-center relative hover:-translate-y-0.5 transition"
            >
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gold-500 text-navy-950 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                MOST POPULAR
              </span>
              <p className="font-display font-bold text-lg text-slate-800">Premium</p>
              <p className="text-2xl font-bold text-slate-800 my-1">
                ${SUBSCRIPTION_TIERS.PREMIUM.monthlyPrice}
                <span className="text-sm font-normal text-slate-400">/mo</span>
              </p>
              <p className="text-xs text-slate-500 leading-snug">
                Free entry fee + free mile every {SUBSCRIPTION_TIERS.PREMIUM.ridesForFreeEntry} rides
              </p>
            </Link>
          </div>
          <p className="text-xs text-slate-400 text-center mb-6">
            {SUBSCRIPTION_TRIAL_DAYS}-day free trial on either plan. Cancel anytime.
          </p>

          <Link
            to="/profile"
            className="block w-full text-center border-2 border-blue-300 bg-blue-50 text-blue-700 font-bold text-base py-4 rounded-2xl mb-4"
          >
            Load Your Account for Rides Today!
          </Link>

          <button
            onClick={() => navigate("/trip-details")}
            className="block w-full text-center text-slate-500 text-sm font-semibold py-2"
          >
            Skip for now &mdash; just book a ride
          </button>
        </div>
      </div>
    </div>
  );
}
