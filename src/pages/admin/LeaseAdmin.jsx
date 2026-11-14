import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { DUE_TEXT, LEASE_CFG, clock, money } from "../../config/lease";
import { leaseLocked, leasePeriodKey, leaseWindow } from "../../../functions/lib/dispatchCore.mjs";

const receive = httpsCallable(functions, "receiveEnvelope");
const adjust = httpsCallable(functions, "adjustLease");
const time = (ms) => new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const toCents = (v) => Math.round(parseFloat(String(v).replace(/[$,]/g, "")) * 100);

function EnvelopeRow({ env }) {
  const [amount, setAmount] = useState((env.amountCents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function counted() {
    setBusy(true);
    setMsg("");
    try {
      await receive({ envelopeId: env.id, receivedCents: toCents(amount) });
    } catch (e) {
      setMsg(e?.message || "Couldn't save.");
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-3 flex-wrap border border-slate-200 rounded-xl p-3">
      <div className="flex-1 min-w-40">
        <p className="font-bold">
          Car {env.carNumber} {env.driverName ? `· ${env.driverName}` : ""}
        </p>
        <p className="text-sm text-slate-400">
          Logged {money(env.amountCents)} &middot; {time(env.droppedAt)}
        </p>
      </div>
      <label className="text-sm text-slate-600">
        Counted $
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="ml-1 w-24 border rounded-lg px-2 py-1.5" />
      </label>
      <button disabled={busy} onClick={counted} className="rounded-xl px-4 py-2 font-bold bg-emerald-600 text-white">
        Received
      </button>
      {msg && <p className="w-full text-sm text-red-600">{msg}</p>}
    </div>
  );
}

function ShortRow({ env, onOwe }) {
  return (
    <div className="flex items-center gap-3 flex-wrap bg-red-50 border border-red-200 rounded-xl p-3">
      <p className="flex-1">
        <span className="font-bold">Car {env.carNumber}</span> envelope was {money(env.amountCents)}, counted{" "}
        {money(env.receivedCents)} &mdash; <span className="font-bold text-red-700">{money(-env.mismatchCents)} short</span>
      </p>
      {!env.shortHandledAt && (
        <button onClick={() => onOwe(env)} className="rounded-xl px-3 py-2 text-sm font-bold bg-red-600 text-white">
          Add {money(-env.mismatchCents)} to what he owes
        </button>
      )}
    </div>
  );
}

function AdjustForm({ driver, onDone }) {
  const [kind, setKind] = useState("credit");
  const [amount, setAmount] = useState("");
  const [sign, setSign] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await adjust({ uid: driver.id, kind, cents: kind === "waive" ? 0 : sign * toCents(amount), note });
      onDone();
    } catch (e) {
      setMsg(e?.message || "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
      <div className="flex gap-2 flex-wrap">
        {[
          ["credit", "Lease credit"],
          ["owe", "Amount owed"],
          ["waive", "No lease today"],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${kind === k ? "bg-navy-950 text-white" : "bg-white border"}`}>
            {label}
          </button>
        ))}
      </div>
      {kind !== "waive" && (
        <div className="flex gap-2 items-center">
          <select value={sign} onChange={(e) => setSign(Number(e.target.value))} className="border rounded-lg px-2 py-1.5">
            <option value={1}>Add</option>
            <option value={-1}>Take off</option>
          </select>
          <span>$</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-24 border rounded-lg px-2 py-1.5" />
        </div>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (shows on his history)" className="w-full border rounded-lg px-2 py-1.5" />
      <button disabled={busy} onClick={save} className="rounded-lg px-4 py-2 font-bold bg-gold-400 text-navy-950">
        Save
      </button>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}

function History({ uid }) {
  const [days, setDays] = useState(null);
  useEffect(() => {
    getDocs(query(collection(db, "ledger", uid, "days"), orderBy("periodKey", "desc"), limit(14))).then((s) =>
      setDays(s.docs.map((d) => d.data()))
    );
  }, [uid]);
  if (!days) return <p className="text-sm text-slate-400">Loading&hellip;</p>;
  if (!days.length) return <p className="text-sm text-slate-400">No lease days yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-slate-400 text-left">
        <tr>
          <th className="py-1">Due</th>
          <th>Card</th>
          <th>Credit in</th>
          <th>Lease</th>
          <th>Envelope</th>
          <th>Credit out</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.periodKey} className="border-t">
            <td className="py-1">{d.periodKey}</td>
            <td>{money((d.cardFaresCents ?? 0) + (d.cardTipsCents ?? 0))}</td>
            <td>{d.settledAt ? money(d.creditInCents) : "—"}</td>
            <td>{d.settledAt ? money(d.leaseDueCents) : "open"}</td>
            <td className={d.envelopeDueCents ? "text-amber-700 font-semibold" : ""}>{d.settledAt ? money(d.envelopeDueCents) : "—"}</td>
            <td>{d.settledAt ? money(d.creditOutCents) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DriverRow({ driver, periodKey, now }) {
  const [day, setDay] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => onSnapshot(doc(db, "ledger", driver.id, "days", periodKey), (s) => setDay(s.data() || null)), [driver.id, periodKey]);
  const card = (day?.cardFaresCents ?? 0) + (day?.cardTipsCents ?? 0);
  const owed = driver.leaseOwedCents ?? 0;
  const locked = leaseLocked({ owedCents: owed, owedPeriodKey: driver.leaseOwedPeriodKey, now }, LEASE_CFG);
  return (
    <div className="border-b border-slate-200 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-bold w-20">Car {driver.carNumber}</span>
        <span className="text-slate-600 flex-1 min-w-24">{driver.name}</span>
        <span className="text-sm w-28">{day ? `Card today ${money(card)}` : <span className="text-slate-400">Not out today</span>}</span>
        <span className="text-sm w-24">Credit {money(driver.leaseCreditCents)}</span>
        <span className={`text-sm w-32 font-semibold ${owed ? (locked ? "text-red-700" : "text-amber-700") : "text-slate-400"}`}>
          {owed ? `Owes ${money(owed)}${locked ? " · locked" : ""}` : "Paid up"}
        </span>
        <button onClick={() => setOpen(open === "adj" ? null : "adj")} className="text-sm font-semibold text-blue-700">
          Adjust
        </button>
        <button onClick={() => setOpen(open === "hist" ? null : "hist")} className="text-sm font-semibold text-blue-700">
          History
        </button>
      </div>
      {open === "adj" && (
        <div className="mt-2">
          <AdjustForm driver={driver} onDone={() => setOpen(null)} />
        </div>
      )}
      {open === "hist" && (
        <div className="mt-2 overflow-x-auto">
          <History uid={driver.id} />
        </div>
      )}
    </div>
  );
}

// Malcolm's lease desk: count envelopes, see who owes, adjust, history.
export default function LeaseAdmin() {
  const [drivers, setDrivers] = useState([]);
  const [dropped, setDropped] = useState([]);
  const [received, setReceived] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const periodKey = leasePeriodKey(now, LEASE_CFG);
  const windowState = leaseWindow(now, LEASE_CFG);

  useEffect(() => {
    const offs = [
      onSnapshot(query(collection(db, "drivers"), where("active", "==", true)), (s) =>
        setDrivers(
          s.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.carNumber).localeCompare(String(b.carNumber), undefined, { numeric: true }))
        )
      ),
      onSnapshot(query(collection(db, "envelopes"), where("status", "==", "dropped"), orderBy("droppedAt", "desc")), (s) =>
        setDropped(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "envelopes"), where("status", "==", "received"), orderBy("droppedAt", "desc"), limit(30)), (s) =>
        setReceived(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      offs.forEach((o) => o());
      clearInterval(t);
    };
  }, []);

  const shorts = useMemo(() => received.filter((e) => e.mismatchCents < 0 && !e.shortHandledAt), [received]);
  const owing = drivers.filter((d) => (d.leaseOwedCents ?? 0) > 0);

  async function oweShort(env) {
    try {
      await adjust({ uid: env.driverId, kind: "owe", cents: -env.mismatchCents, note: `Envelope short ${money(-env.mismatchCents)}`, envelopeId: env.id });
    } catch (e) {
      alert(e?.message || "Couldn't save.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-950 text-white px-6 py-4 flex items-center gap-4 flex-wrap">
        <Link to="/admin/dashboard" className="text-slate-300 hover:text-white font-semibold">
          &larr; Dispatch
        </Link>
        <h1 className="font-display font-bold text-2xl">Lease</h1>
        <p className="text-sm text-slate-300 ml-auto">
          {money(LEASE_CFG.lease.dailyCents)}/day &middot; due {DUE_TEXT} &middot;{" "}
          {windowState === "in_window" ? "due now" : windowState === "after_window" ? "past due time" : "not due yet"}
        </p>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-5">
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-bold text-lg">Envelopes to count ({dropped.length})</h2>
          {dropped.length === 0 && <p className="text-slate-400">None waiting.</p>}
          {dropped.map((e) => (
            <EnvelopeRow key={e.id} env={e} />
          ))}
          {shorts.map((e) => (
            <ShortRow key={e.id} env={e} onOwe={oweShort} />
          ))}
        </section>

        {owing.length > 0 && (
          <section className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
            <h2 className="font-bold text-lg text-amber-900">Still owed ({owing.length})</h2>
            <p className="text-amber-900">
              {owing.map((d) => `Car ${d.carNumber} ${money(d.leaseOwedCents)}`).join(" · ")}
            </p>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="font-bold text-lg mb-1">Drivers</h2>
          <p className="text-sm text-slate-400 mb-2">
            Lease day ending {periodKey} at {clock(LEASE_CFG.lease.dueStart)}. Card fares and tips go toward the lease; extra rolls forward as credit.
          </p>
          {drivers.map((d) => (
            <DriverRow key={d.id} driver={d} periodKey={periodKey} now={now} />
          ))}
        </section>
      </main>
    </div>
  );
}
