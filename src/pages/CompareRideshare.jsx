import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import { COMPANY_NAME } from "../config/constants";
import { calcSavings, RIDESHARE_BENCHMARK } from "../config/fareCalc";

const TRIP_EXAMPLES = [
  { label: "Short Trip", miles: 3 },
  { label: "Medium Trip", miles: 10 },
  { label: "Long Trip", miles: 25 },
];

export default function CompareRideshare() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-2">
            {COMPANY_NAME} vs. Rideshare
          </h1>
          <p className="text-slate-600 text-base leading-relaxed mb-6">
            Real meter rates, compared honestly against national rideshare
            averages &mdash; no surge, no booking fee, no commission hidden
            in the price.
          </p>

          <div className="space-y-4 mb-8">
            {TRIP_EXAMPLES.map(({ label, miles }) => {
              const { ours, theirs, savings, percent } = calcSavings(miles);
              return (
                <div
                  key={label}
                  className="border-2 border-slate-200 rounded-2xl p-5"
                >
                  <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-3">
                    {label} &middot; ~{miles} miles
                  </p>
                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">{COMPANY_NAME}</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        ${ours.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400 mb-0.5">Rideshare Avg. (Uber/Lyft)</p>
                      <p className="text-2xl font-bold text-slate-400 line-through">
                        ${theirs.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="bg-emerald-50 text-emerald-700 text-center font-bold text-base rounded-xl py-2.5">
                    Save ${Math.abs(savings).toFixed(2)} ({Math.abs(percent).toFixed(0)}%)
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-2 border-slate-200 rounded-2xl p-5 mb-8">
            <p className="text-base font-bold text-slate-800 mb-2">
              Where these numbers come from
            </p>
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              Our side is the real, regulated meter rate: $2.16 for the first
              1/6 mile, then $0.33 for each additional 1/6 mile ($1.98 per
              mile after that), no commission and no surge, ever.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              The rideshare side uses a conservative national average of
              about ${RIDESHARE_BENCHMARK.perMile.toFixed(2)}/mile plus a
              ${RIDESHARE_BENCHMARK.bookingFee.toFixed(2)} booking fee &mdash;
              standard, non-surge pricing. During surge pricing (bad weather,
              graduations, weekend nights), rideshare prices commonly run
              1.5&times;&ndash;2.5&times; higher than shown here, while our
              rate never changes.
            </p>
            <p className="text-slate-500 text-xs">
              Estimates only &mdash; your actual fare is set by the cab
              meter. Rideshare pricing varies by market and changes over
              time.
            </p>
          </div>

          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
