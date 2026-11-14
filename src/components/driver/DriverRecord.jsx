import { Link } from "react-router-dom";
import { BRAND } from "../../config/constants";
import { money } from "../../config/lease";
import { INCENTIVE_DEFAULTS, incentivePeriod, strikesBetween } from "../../../functions/lib/dispatchCore.mjs";

const INC = { ...INCENTIVE_DEFAULTS, ...(BRAND.dispatch?.incentives || {}) };
const TZ = BRAND.dispatch?.timeZone || "America/New_York";
const MAX_WARNINGS = BRAND.dispatch?.maxWarnings ?? 3;

function shortDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric" });
}
function dayBefore(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Score, warnings, and the clean-period bonus ("$5 off the lick"). */
export default function DriverRecord({ driver }) {
  const now = Date.now();
  const period = incentivePeriod(now, INC, TZ);
  const strikes = strikesBetween(driver.recentStrikes || [], period.startKey, period.endKey, TZ);
  const lost = strikes >= INC.strikesToForfeit;
  const last = driver.lastBonus;

  return (
    <section className="glass-panel border border-white/10 rounded-2xl p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Record</p>
        <Link to="/driver/profile" className="text-sm font-semibold text-gold-300">
          My profile &rarr;
        </Link>
      </div>
      {driver.callHoldUntil > now && (
        <p className="rounded-xl bg-red-500/15 border border-red-400/40 p-3 text-red-200">
          Score under {INC.lowScore}: no app calls until {new Date(driver.callHoldUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
        </p>
      )}
      <div className="flex gap-6">
        <div>
          <p className="text-2xl font-bold tabular-nums">{driver.score ?? 100}</p>
          <p className="text-sm text-slate-400">Score</p>
        </div>
        <div>
          <p className={`text-2xl font-bold tabular-nums ${driver.warnings ? "text-amber-300" : ""}`}>
            {driver.warnings ?? 0}
            <span className="text-base text-slate-500">/{MAX_WARNINGS}</span>
          </p>
          <p className="text-sm text-slate-400">Warnings</p>
        </div>
      </div>
      <div className={`rounded-xl p-3 ${lost ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
        {lost ? (
          <p className="text-red-300">
            Bonus lost for {shortDate(period.startKey)}&ndash;{shortDate(dayBefore(period.endKey))} ({strikes} turned-down or missed calls).
          </p>
        ) : (
          <p className="text-emerald-200">
            Stay clean through {shortDate(dayBefore(period.endKey))} and work {INC.bonusMinDays}+ days: {money(INC.bonusCents)} off your lease.
            {strikes > 0 && ` ${INC.strikesToForfeit - strikes} more missed call${INC.strikesToForfeit - strikes === 1 ? "" : "s"} and it's gone.`}
          </p>
        )}
      </div>
      {last && (
        <p className="text-sm text-slate-400">
          Last period ({shortDate(last.periodStartKey)}):{" "}
          {last.award ? `+${money(last.cents)} added to your lease credit` : last.reason === "strikes" ? "no bonus (missed calls)" : `no bonus (under ${INC.bonusMinDays} days worked)`}
        </p>
      )}
      <p className="text-xs text-slate-500">Turning down or missing a call when you&apos;re next up costs a warning and {INC.scoreStrikePoints} points. Requested calls never count.</p>
    </section>
  );
}
