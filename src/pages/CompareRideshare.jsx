import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import { COMPANY_NAME, FARE_CONFIG } from "../config/constants";
import {
  calcSavings,
  calcMeterFareOnly,
  calcRideshareEstimate,
  RIDESHARE_MEDIAN,
} from "../config/fareCalc";

const MILES_LIST = [2, 5, 10, 20];
const money = (n) => `$${n.toFixed(2)}`;

export default function CompareRideshare() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Compare Rates" />

      <div className="bg-navy-950 text-white px-6 py-8">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs font-bold tracking-[0.3em] text-gold-400 uppercase">{COMPANY_NAME} vs. Uber &amp; Lyft</p>
          <h1 className="font-display text-3xl font-bold mt-2 leading-tight">
            No surge. <span className="text-gold-300">No booking fee.</span>
          </h1>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="max-w-md mx-auto space-y-6">
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="p-3 font-semibold">Distance</th>
                  <th className="p-3 font-semibold text-emerald-800">Us</th>
                  <th className="p-3 font-semibold">Uber</th>
                  <th className="p-3 font-semibold">Lyft</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MILES_LIST.map((miles) => {
                  const ours = calcMeterFareOnly(miles);
                  const theirs = calcRideshareEstimate(miles);
                  const savings = Math.max(0, theirs - ours);
                  const pct = theirs > 0 ? Math.round((savings / theirs) * 100) : 0;
                  return (
                    <tr key={miles} className="hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-800">{miles} mi</td>
                      <td className="p-3 font-bold text-emerald-700 text-base">{money(ours)}</td>
                      <td className="p-3 text-slate-700">
                        {money(theirs)} <span className="text-xs text-emerald-600 block font-semibold">{pct > 0 ? `Save ${pct}%` : ""}</span>
                      </td>
                      <td className="p-3 text-slate-700">
                        {money(theirs)} <span className="text-xs text-emerald-600 block font-semibold">{pct > 0 ? `Save ${pct}%` : ""}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-center text-slate-500">
            Based on standard fares compared to national rideshare medians.
          </p>

          <Link
            to="/trip-details"
            className="block text-center bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-extrabold text-lg py-4 rounded-full shadow-luxury"
          >
            Book a Ride &rarr;
          </Link>

          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
