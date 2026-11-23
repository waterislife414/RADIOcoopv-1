import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import { COMPANY_NAME, COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL } from "../config/constants";
import {
  calcMeterFareOnly,
  calcRideshareEstimate,
  RIDESHARE_RATE,
  UBER_COLUMBUS_EXAMPLES,
} from "../config/fareCalc";

const MILES_LIST = [2, 5, 10, 20];
const money = (n) => `$${n.toFixed(2)}`;
const pctLess = (ours, theirs) => (theirs > ours ? Math.round(((theirs - ours) / theirs) * 100) : 0);

export default function CompareRideshare() {
  const local = UBER_COLUMBUS_EXAMPLES;
  // The distance estimate is only shown as "lower than Uber's own numbers" when that is true for every in-town trip.
  const estimateIsLower = local.trips
    .filter((t) => !t.outOfArea)
    .every((t) => calcRideshareEstimate(t.miles) <= t.uber);
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
          <section>
            <h2 className="font-display text-xl font-bold text-slate-800">Real Columbus trips</h2>
            <p className="text-sm text-slate-600 mb-3">Uber&rsquo;s own average price vs. our meter for the same miles.</p>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left border-collapse text-sm" data-testid="compare-local">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="p-3 font-semibold">Trip</th>
                    <th className="p-3 font-semibold text-emerald-800">Us</th>
                    <th className="p-3 font-semibold">Uber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {local.trips.map((t) => {
                    const ours = t.outOfArea ? null : calcMeterFareOnly(t.miles);
                    const pct = ours == null ? 0 : pctLess(ours, t.uber);
                    return (
                      <tr key={`${t.from}-${t.to}`}>
                        <td className="p-3 text-slate-800">
                          {t.from} to {t.to}
                          <span className="block text-xs text-slate-500">{t.miles} mi</span>
                        </td>
                        <td className="p-3 font-bold text-emerald-700 text-base">
                          {ours == null ? (
                            <a href={`tel:${COMPANY_PHONE_TEL}`} className="text-sm font-semibold text-blue-600 underline">Call for a quote</a>
                          ) : (
                            money(ours)
                          )}
                        </td>
                        <td className="p-3 text-slate-700">
                          {money(t.uber)}
                          {pct > 0 && <span className="text-xs text-emerald-600 block font-semibold">{pct}% less with us</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2" data-testid="compare-local-footnote">
              Uber prices: the average UberX price for each trip over the past month, as published on{" "}
              <a href={local.source} target="_blank" rel="noopener noreferrer" className="underline">Uber&rsquo;s Columbus page</a>
              , checked {local.checked}. Uber says they are not fixed or guaranteed prices. Our prices: the city meter for the same
              miles, one rider, before wait time ($0.35/min) and the card fee. Long trips out of town can cost less with Uber: call{" "}
              {COMPANY_PHONE_DISPLAY} for our price.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-slate-800">By distance</h2>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 mt-2">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="p-3 font-semibold">Distance</th>
                    <th className="p-3 font-semibold text-emerald-800">Us</th>
                    <th className="p-3 font-semibold">Uber/Lyft estimate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MILES_LIST.map((miles) => {
                    const ours = calcMeterFareOnly(miles);
                    const theirs = calcRideshareEstimate(miles);
                    const pct = pctLess(ours, theirs);
                    return (
                      <tr key={miles} className="hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-800">{miles} mi</td>
                        <td className="p-3 font-bold text-emerald-700 text-base">{money(ours)}</td>
                        <td className="p-3 text-slate-700">
                          {money(theirs)}
                          {pct > 0 && <span className="text-xs text-emerald-600 block font-semibold">About {pct}% less with us</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2" data-testid="compare-footnote">
              Uber/Lyft estimate: ${RIDESHARE_RATE.perMile.toFixed(2)} per mile plus a ${RIDESHARE_RATE.booking.toFixed(2)} booking fee, averages
              gathered {RIDESHARE_RATE.asOf}.
              {estimateIsLower ? " Uber’s own Columbus averages above are higher than this estimate." : ""} Real prices vary by
              city, time and demand. These are estimates only. Radio Co-op does not control, verify or guarantee Uber or Lyft prices
              and is not responsible for their accuracy.
            </p>
          </section>

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
