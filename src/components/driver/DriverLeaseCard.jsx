import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { DUE_TEXT, LEASE_CFG, clock, money } from "../../config/lease";
import { leaseLocked, leasePeriodKey, leaseWindow } from "../../../functions/lib/dispatchCore.mjs";

const logEnvelope = httpsCallable(functions, "logEnvelope");

/** Today's lick: card money so far, credit, envelope owed, and the envelope button. */
export default function DriverLeaseCard({ driver }) {
  const uid = driver.id;
  const [now, setNow] = useState(() => Date.now());
  const key = leasePeriodKey(now, LEASE_CFG);
  const [day, setDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => onSnapshot(doc(db, "ledger", uid, "days", key), (s) => setDay(s.data() || null)), [uid, key]);

  const lease = LEASE_CFG.lease.dailyCents - (day?.discountCents ?? 0);
  const credit = driver.leaseCreditCents ?? 0;
  const card = (day?.cardFaresCents ?? 0) + (LEASE_CFG.lease.includeTips ? day?.cardTipsCents ?? 0 : 0);
  const covered = Math.min(lease, credit + card);
  const owed = driver.leaseOwedCents ?? 0;
  const locked = leaseLocked({ owedCents: owed, owedPeriodKey: driver.leaseOwedPeriodKey, now }, LEASE_CFG);
  const inWindow = leaseWindow(now, LEASE_CFG) === "in_window";
  const env = driver.lastEnvelope;
  const recentEnv = env && now - env.droppedAt < 20 * 3600_000;

  async function dropped() {
    setBusy(true);
    setMsg("");
    try {
      await logEnvelope({});
    } catch (e) {
      setMsg(e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`glass-panel rounded-2xl p-5 space-y-3 border ${locked ? "border-red-500" : "border-white/10"}`}>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold tracking-widest text-slate-500 uppercase">Lick &middot; due {DUE_TEXT}</p>
        <p className="text-sm text-slate-500">Credit {money(credit)}</p>
      </div>

      {owed > 0 ? (
        <div className="space-y-3">
          <p className={`text-2xl font-bold ${locked ? "text-red-300" : "text-amber-300"}`}>
            Put {money(owed)} in your envelope
          </p>
          <p className="text-slate-300">
            {locked
              ? "You're off the board until it's logged."
              : `Drop it in the safe by ${clock(LEASE_CFG.lease.dueEnd)}${inWindow ? " today" : ""}, then tap below.`}
          </p>
          <button
            disabled={busy}
            onClick={dropped}
            className="w-full rounded-2xl py-4 text-lg font-bold bg-gold-400 text-navy-950 disabled:opacity-50"
          >
            I dropped my envelope ({money(owed)})
          </button>
        </div>
      ) : (
        recentEnv && (
          <p className="text-emerald-300">
            {"✓"} Envelope logged {money(env.amountCents)} at{" "}
            {new Date(env.droppedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        )
      )}

      <div>
        <div className="flex justify-between text-sm text-slate-300">
          <span>This lick day</span>
          <span>
            {money(covered)} of {money(lease)}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-white/10 mt-1 overflow-hidden">
          <div className="h-full bg-emerald-400" style={{ width: `${lease ? Math.min(100, (covered / lease) * 100) : 0}%` }} />
        </div>
      </div>

      {msg && <p className="text-red-300 text-sm">{msg}</p>}
    </section>
  );
}
