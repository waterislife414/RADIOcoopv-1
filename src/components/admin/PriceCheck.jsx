import { useEffect, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { BRAND, FARE_CONFIG } from "../../config/constants";
import { suggestRoadFactor, dollars } from "../../../functions/lib/fareEstimate.mjs";

const MIN_RIDES = 20;
const DRIVER_MIN_RIDES = 5;
const HIGH_RATIO = 1.2; // a driver's meters average 20%+ over the estimates

/**
 * Learn prices from real meters, and catch problems early: compares what drivers typed
 * on card rides with the estimate the rider saw. Suggests a new road factor once there
 * are enough rides; lists riders' "Something wrong with this charge?" taps and drivers
 * whose meters run high. Nothing here changes money; the office follows up.
 */
export default function PriceCheck() {
  const [rows, setRows] = useState(null);
  const [questions, setQuestions] = useState([]);
  useEffect(() => {
    getDocs(query(collection(db, "rides"), where("meterCents", ">", 0), limit(500)))
      .then((snap) => setRows(snap.docs.map((d) => d.data())))
      .catch(() => setRows([]));
    getDocs(query(collection(db, "owner_inbox"), where("type", "==", "charge_question"), limit(50)))
      .then((snap) => setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || 0) - (a.at || 0))))
      .catch(() => setQuestions([]));
  }, []);
  if (!rows) return null;
  const current = Number(BRAND.pricing?.estimate?.roadFactor) || 1.35;
  const samples = rows.filter((r) => Number(r.estMiles) > 0).map((r) => ({ estMiles: r.estMiles, meterCents: r.meterCents, passengers: r.passengers || 1 }));
  const s = suggestRoadFactor(samples, FARE_CONFIG, current, MIN_RIDES);
  const withEst = rows.filter((r) => r.estFareCents > 0);
  const meterSum = withEst.reduce((n, r) => n + r.meterCents, 0);
  const estSum = withEst.reduce((n, r) => n + r.estFareCents, 0);
  const pct = estSum ? Math.round((meterSum / estSum - 1) * 100) : null;
  const lockPaid = rows.reduce((n, r) => n + (r.lockOffCents || 0), 0);
  const creditPaid = rows.reduce((n, r) => n + (r.creditUsedCents || 0), 0);

  const byDriver = {};
  for (const r of withEst) {
    const k = r.carNumber || r.driverId || "?";
    (byDriver[k] ||= { meter: 0, est: 0, n: 0 }).meter += r.meterCents;
    byDriver[k].est += r.estFareCents;
    byDriver[k].n += 1;
  }
  const high = Object.entries(byDriver).filter(([, d]) => d.n >= DRIVER_MIN_RIDES && d.meter / d.est >= HIGH_RATIO);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2" data-testid="price-check">
      <h2 className="font-bold text-lg">Price check (real meters vs. estimates)</h2>
      {withEst.length === 0 ? (
        <p className="text-slate-600">No card rides with a typed meter yet. This fills in as drivers charge cards at drop-off.</p>
      ) : (
        <p className="text-slate-700">
          {withEst.length} ride{withEst.length === 1 ? "" : "s"}: meters came to {dollars(meterSum)} against {dollars(estSum)} estimated
          {pct != null && ` (${pct >= 0 ? "+" : ""}${pct}%)`}.
        </p>
      )}
      {(lockPaid > 0 || creditPaid > 0) && (
        <p className="text-sm text-slate-600">
          Member deals paid by the company: Price Lock {dollars(lockPaid)}, ride credit {dollars(creditPaid)}.
        </p>
      )}
      {s.factor == null ? (
        <p className="text-sm text-slate-500">
          A suggested change shows after {MIN_RIDES} rides ({s.rides} so far). Road factor now: {current}.
        </p>
      ) : s.factor === current ? (
        <p className="text-sm text-emerald-700 font-semibold">Estimates are on target (road factor {current}).</p>
      ) : (
        <p className="text-sm text-amber-800 font-semibold">
          Suggest road factor {s.factor} (now {current}), from {s.rides} rides. Change <code>pricing.estimate.roadFactor</code> in
          branding.config.json, then run the branding sync.
        </p>
      )}
      {high.map(([car, d]) => (
        <p key={car} className="text-sm text-red-700 font-semibold" data-testid="meter-high">
          Car {car}: meters average {Math.round((d.meter / d.est - 1) * 100)}% over the estimate ({d.n} rides). Worth a look.
        </p>
      ))}
      {questions.length > 0 && (
        <div className="pt-2 border-t border-slate-200" data-testid="charge-questions">
          <p className="font-semibold">Riders asking about a charge ({questions.length})</p>
          {questions.slice(0, 10).map((q) => (
            <p key={q.id} className="text-sm text-slate-700">
              {new Date(q.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}: car {q.carNumber || "?"},
              meter {dollars(q.meterCents || 0)}
              {q.estFareCents ? ` vs about ${dollars(q.estFareCents)}` : ""}
              {q.phone ? ` · call ${q.phone}` : ""}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
