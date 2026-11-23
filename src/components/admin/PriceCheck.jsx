import { useEffect, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { BRAND, FARE_CONFIG } from "../../config/constants";
import { suggestRoadFactor, dollars } from "../../../functions/lib/fareEstimate.mjs";

const MIN_RIDES = 20;

/**
 * Learn prices from real meters: compares what drivers typed on finished card
 * rides with the estimate the rider saw. Suggests a new road factor once there
 * are enough rides; the owner changes it in branding.config.json.
 */
export default function PriceCheck() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    getDocs(query(collection(db, "rides"), where("meterCents", ">", 0), limit(500)))
      .then((snap) => setRows(snap.docs.map((d) => d.data())))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return null;
  const current = Number(BRAND.pricing?.estimate?.roadFactor) || 1.35;
  const samples = rows.filter((r) => Number(r.estMiles) > 0).map((r) => ({ estMiles: r.estMiles, meterCents: r.meterCents, passengers: r.passengers || 1 }));
  const s = suggestRoadFactor(samples, FARE_CONFIG, current, MIN_RIDES);
  const withEst = rows.filter((r) => r.estFareCents > 0);
  const meterSum = withEst.reduce((n, r) => n + r.meterCents, 0);
  const estSum = withEst.reduce((n, r) => n + r.estFareCents, 0);
  const pct = estSum ? Math.round((meterSum / estSum - 1) * 100) : null;
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
    </section>
  );
}
