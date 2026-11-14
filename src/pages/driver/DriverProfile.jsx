import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { BRAND } from "../../config/constants";
import { LEASE_CFG, money } from "../../config/lease";
import { CERT_LABELS } from "../../config/driverCerts";
import { formatPhoneDisplay } from "../../utils/phone";
import { INCENTIVE_DEFAULTS, canHoldCredit, hasCert, leasePeriodKey, standing } from "../../../functions/lib/dispatchCore.mjs";

const INC = { ...INCENTIVE_DEFAULTS, ...(BRAND.dispatch?.incentives || {}) };
const MAX_WARNINGS = BRAND.dispatch?.maxWarnings ?? 3;
const saveContact = httpsCallable(functions, "updateDriverContact");
const setHold = httpsCallable(functions, "setLeaseHold");

const RECORD_LABEL = {
  missed_call: "Didn't answer a call",
  declined: "Turned down a call",
  write_up: "Write-up",
  accident: "Accident",
  no_show: "No-show",
  complaint: "Complaint",
  other: "Note from the office",
  call_ended: "Couldn't finish a call",
};
const day = (ms) => new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const card = "glass-panel border border-white/10 rounded-2xl p-5 space-y-3";
const label = "text-xs font-bold tracking-widest text-slate-500 uppercase";
const input = "w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2.5 text-white placeholder:text-slate-500";

function Contact({ driver }) {
  const [f, setF] = useState({ phone: driver.phone || "", address: driver.address || "", emergencyName: driver.emergencyName || "", emergencyPhone: driver.emergencyPhone || "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await saveContact(f);
      setMsg({ ok: true, text: "Saved." });
    } catch (err) {
      setMsg({ ok: false, text: err?.message || "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className={card}>
      <p className={label}>My information</p>
      <div className="text-slate-300">
        <p className="text-xl font-bold text-white">{driver.name}</p>
        <p className="text-sm">{driver.email}</p>
      </div>
      <input className={input} value={f.phone} onChange={set("phone")} placeholder="Cell phone" inputMode="tel" />
      <input className={input} value={f.address} onChange={set("address")} placeholder="Home address" />
      <div className="grid grid-cols-2 gap-2">
        <input className={input} value={f.emergencyName} onChange={set("emergencyName")} placeholder="Emergency contact" />
        <input className={input} value={f.emergencyPhone} onChange={set("emergencyPhone")} placeholder="Their phone" inputMode="tel" />
      </div>
      <button disabled={busy} className="w-full rounded-xl py-3 font-bold bg-gold-400 text-navy-950 disabled:opacity-50">
        {busy ? "Saving…" : "Save"}
      </button>
      {msg && <p className={msg.ok ? "text-emerald-300 text-sm" : "text-red-300 text-sm"}>{msg.text}</p>}
    </form>
  );
}

function Score({ driver, now }) {
  const s = standing(driver, now, INC);
  const held = driver.callHoldUntil > now;
  const tone = s.score >= 90 ? "text-emerald-300" : s.score >= INC.lowScore ? "text-amber-300" : "text-red-300";
  return (
    <section className={card}>
      <p className={label}>Driver score</p>
      <div className="flex items-end gap-6">
        <p className={`text-5xl font-bold tabular-nums ${tone}`}>
          {s.score}
          <span className="text-xl text-slate-500">/100</span>
        </p>
        <p className="text-slate-300 pb-1">
          Warnings{" "}
          <span className={`font-bold ${s.warnings ? "text-amber-300" : "text-white"}`}>
            {s.warnings}/{MAX_WARNINGS}
          </span>
        </p>
      </div>
      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${s.score >= INC.lowScore ? "bg-emerald-400" : "bg-red-400"}`} style={{ width: `${s.score}%` }} />
      </div>
      {held && (
        <p className="rounded-xl bg-red-500/15 border border-red-400/40 p-3 text-red-200">
          Your score is under {INC.lowScore}. No app calls until {new Date(driver.callHoldUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Dispatch can still send you calls.
        </p>
      )}
      <p className="text-sm text-slate-500">
        Everyone starts at 100. A missed or turned-down call is {INC.scoreStrikePoints} points and a warning. {MAX_WARNINGS} warnings is a write-up and you&apos;re off the board until the
        office puts you back. Under {INC.lowScore}, the app stops sending you calls for {INC.lowScoreHoldHours} hours. Everything drops off after {INC.scoreWindowDays} days.
      </p>
    </section>
  );
}

function Record({ uid, now }) {
  const [rows, setRows] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, "drivers", uid, "record"), orderBy("at", "desc"), limit(40)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })))), [uid]);
  const active = (rows || []).filter((r) => r.expiresAt > now);
  return (
    <section className={card}>
      <p className={label}>On my record ({INC.scoreWindowDays} days)</p>
      {rows && active.length === 0 && <p className="text-emerald-300">Clean. Nothing on your record.</p>}
      {active.map((r) => (
        <div key={r.id} className="border-t border-white/10 pt-2 first:border-0 first:pt-0">
          <div className="flex items-baseline gap-2">
            <p className={`font-bold flex-1 ${r.type === "write_up" || r.type === "accident" ? "text-red-300" : "text-amber-200"}`}>{RECORD_LABEL[r.type] || r.type}
              {r.label ? `: ${r.label}` : ""}
              {r.warnings ? ` (${r.warnings} warning${r.warnings > 1 ? "s" : ""})` : ""}
            </p>
            {r.points > 0 && <p className="text-sm text-slate-300">&minus;{r.points}</p>}
          </div>
          {r.note && <p className="text-sm text-slate-300">{r.note}</p>}
          <p className="text-xs text-slate-500">
            {day(r.at)} &middot; comes off {day(r.expiresAt)}
            {r.source === "office" ? " · entered by the office" : ""}
          </p>
        </div>
      ))}
    </section>
  );
}

function CardMoney({ uid }) {
  const [days, setDays] = useState(null);
  useEffect(
    () =>
      onSnapshot(query(collection(db, "ledger", uid, "days"), orderBy("periodKey", "desc"), limit(14)), (s) => setDays(s.docs.map((d) => d.data()))),
    [uid]
  );
  const rows = (days || []).filter((d) => (d.cardFaresCents || 0) + (d.cardTipsCents || 0) > 0 || d.settledAt);
  return (
    <section className={card}>
      <p className={label}>Card money by day</p>
      {days && rows.length === 0 && <p className="text-slate-500">No card fares yet.</p>}
      {rows.map((d) => (
        <div key={d.periodKey} className="flex items-center gap-3 border-t border-white/10 pt-2 first:border-0 first:pt-0">
          <div className="flex-1">
            <p className="font-semibold">{d.periodKey}</p>
            <p className="text-xs text-slate-500">
              {d.cardRides || 0} card ride{d.cardRides === 1 ? "" : "s"}
              {d.settledAt ? (d.envelopeDueCents ? ` · envelope ${money(d.envelopeDueCents)}` : " · lease paid by card") : " · today, still open"}
              {d.heldCreditCents ? " · credit held" : ""}
            </p>
          </div>
          <p className="font-bold tabular-nums">{money((d.cardFaresCents || 0) + (d.cardTipsCents || 0))}</p>
        </div>
      ))}
    </section>
  );
}

function Credit({ driver, now }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const key = leasePeriodKey(now, LEASE_CFG);
  const holding = driver.holdCreditPeriod === key;
  const can = canHoldCredit(driver, now, INC);
  async function choose(hold) {
    setBusy(true);
    setMsg("");
    try {
      await setHold({ hold });
    } catch (e) {
      setMsg(e?.message || "Couldn't change it.");
    } finally {
      setBusy(false);
    }
  }
  const opt = (on) => `flex-1 rounded-xl py-3 font-bold border-2 ${on ? "border-gold-400 bg-gold-400 text-navy-950" : "border-white/15 text-slate-200"}`;
  return (
    <section className={card}>
      <div className="flex items-baseline justify-between">
        <p className={label}>Lease credit</p>
        <p className="text-2xl font-bold tabular-nums">{money(driver.leaseCreditCents)}</p>
      </div>
      <p className="text-sm text-slate-500">Card money above the {money(LEASE_CFG.lease.dailyCents)} lease builds up here and pays future lease days.</p>
      {can.ok ? (
        <>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => choose(false)} className={opt(!holding)}>
              Use it today
            </button>
            <button disabled={busy} onClick={() => choose(true)} className={opt(holding)}>
              Hold it today
            </button>
          </div>
          <p className="text-sm text-slate-500">
            {holding ? "Held: today's lease comes from today's card fares and your envelope. Your credit stays put. It goes back to normal tomorrow." : "Your credit goes toward today's lease first."}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          {can.reason === "too_new"
            ? `After ${INC.holdCreditAfterDays} days of driving with a clean record you can choose to hold your credit for a day.`
            : `Holding credit for a day needs a clean record for ${INC.scoreWindowDays} days.`}
        </p>
      )}
      {msg && <p className="text-red-300 text-sm">{msg}</p>}
    </section>
  );
}

/** A driver's own profile: contact info, score, record, card money, lease credit. */
export default function DriverProfile() {
  const { currentUser, isDriver, loading } = useAuth();
  const [driver, setDriver] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const uid = currentUser?.uid;

  useEffect(() => {
    if (!uid || !isDriver) return undefined;
    const off = onSnapshot(doc(db, "drivers", uid), (s) => setDriver(s.exists() ? { id: s.id, ...s.data() } : false));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [uid, isDriver]);

  if (loading) return null;
  if (!currentUser) return <Navigate to="/driver/sign-in" replace />;
  if (!isDriver) return <Navigate to="/driver" replace />;
  if (!driver) return <div className="min-h-screen bg-navy-950" />;

  const certs = Object.keys(CERT_LABELS).filter((c) => hasCert(driver, c, now));
  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <div className="max-w-md mx-auto px-5 pt-6 pb-16 space-y-4">
        <Link to="/driver" className="text-slate-300 font-semibold">
          &larr; Driver Home
        </Link>
        <div>
          <p className="text-xs font-bold tracking-[0.3em] text-gold-400 uppercase">My profile</p>
          <h1 className="font-display text-3xl font-semibold mt-1">Car {driver.carNumber}</h1>
          <div className="flex flex-wrap gap-2 mt-2 text-sm">
            {certs.map((c) => (
              <span key={c} className="rounded-full bg-white/10 px-3 py-1">
                {CERT_LABELS[c].label}
              </span>
            ))}
            {driver.phone && <span className="rounded-full bg-white/10 px-3 py-1">{formatPhoneDisplay(driver.phone)}</span>}
          </div>
        </div>
        <Score driver={driver} now={now} />
        <Record uid={uid} now={now} />
        <Credit driver={driver} now={now} />
        <CardMoney uid={uid} />
        <Contact driver={driver} />
      </div>
    </div>
  );
}
