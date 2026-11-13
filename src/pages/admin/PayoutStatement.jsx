import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { COMPANY_NAME } from "../../config/constants";
import { money } from "../../config/lease";
import { CloseOutLines } from "../../components/admin/CloseOutModal";

const recordCheck = httpsCallable(functions, "recordPayoutCheck");

/** Printable close-out statement, and where Malcolm records the check. */
export default function PayoutStatement() {
  const { payoutId } = useParams();
  const [p, setP] = useState(null);
  const [days, setDays] = useState([]);
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => onSnapshot(doc(db, "payouts", payoutId), (s) => setP(s.exists() ? { id: s.id, ...s.data() } : false)), [payoutId]);
  useEffect(() => {
    if (!p?.driverId) return;
    getDocs(query(collection(db, "ledger", p.driverId, "days"), orderBy("periodKey", "desc"), limit(30))).then((s) =>
      setDays(s.docs.map((d) => d.data()))
    );
  }, [p?.driverId]);

  if (p === false) return <p className="p-6">Statement not found.</p>;
  if (!p) return <p className="p-6">Loading&hellip;</p>;

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await recordCheck({ payoutId, checkNumber, checkDate });
    } catch (e) {
      setMsg(e?.message || "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <header className="bg-navy-950 text-white px-6 py-4 flex items-center gap-4 print:hidden">
        <Link to="/admin/drivers" className="text-slate-300 hover:text-white font-semibold">
          &larr; Drivers
        </Link>
        <button onClick={() => window.print()} className="ml-auto rounded-lg px-4 py-2 bg-white/10 font-semibold">
          Print
        </button>
      </header>
      <main className="max-w-2xl mx-auto p-6 bg-white my-6 rounded-2xl print:my-0 print:rounded-none space-y-5">
        <div>
          <p className="text-sm uppercase tracking-widest text-slate-500">{COMPANY_NAME}</p>
          <h1 className="text-2xl font-bold">Driver close-out statement</h1>
          <p className="text-slate-700 mt-1">
            Car {p.carNumber} &middot; {p.driverName} &middot; {p.reason === "fired" ? "Let go" : "Quit"} on{" "}
            {new Date(p.createdAt).toLocaleDateString()}
          </p>
          {p.note && <p className="text-slate-500 text-sm">{p.note}</p>}
        </div>

        <CloseOutLines m={p} />

        {p.status === "paid" && (
          <p className="font-semibold">
            Paid by check #{p.checkNumber} on {p.checkDate}.
          </p>
        )}
        {p.status === "awaiting_check" && (
          <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4 space-y-2 print:hidden">
            <p className="font-bold">Record the check ({money(p.payoutCents)})</p>
            <div className="flex gap-2 flex-wrap">
              <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="Check #" className="border rounded-lg px-3 py-2 w-32" />
              <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} className="border rounded-lg px-3 py-2" />
              <button disabled={busy || !checkNumber} onClick={save} className="rounded-lg px-4 py-2 font-bold bg-emerald-600 text-white disabled:opacity-40">
                Save
              </button>
            </div>
            {msg && <p className="text-red-600 text-sm">{msg}</p>}
          </div>
        )}

        <div>
          <h2 className="font-bold mb-1">Lease history (last {days.length} days)</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
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
                  <td className="py-1">
                    {d.periodKey}
                    {d.closeOut ? " (final)" : ""}
                  </td>
                  <td>{money((d.cardFaresCents ?? 0) + (d.cardTipsCents ?? 0))}</td>
                  <td>{d.settledAt ? money(d.creditInCents) : "—"}</td>
                  <td>{d.settledAt ? money(d.leaseDueCents) : "open"}</td>
                  <td>{d.settledAt ? money(d.envelopeDueCents) : "—"}</td>
                  <td>{d.settledAt ? money(d.creditOutCents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-8 pt-10">
          <div className="border-t border-slate-400 pt-1 text-sm text-slate-500">Driver signature / date</div>
          <div className="border-t border-slate-400 pt-1 text-sm text-slate-500">{COMPANY_NAME} / date</div>
        </div>
      </main>
    </div>
  );
}
