import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { money } from "../../config/lease";

const preview = httpsCallable(functions, "closeOutPreview");
const closeOut = httpsCallable(functions, "closeOutDriver");

export function CloseOutLines({ m }) {
  const base = m.creditCents + m.cardTodayCents - m.unpaidCents;
  const Row = ({ label, value, bold, minus }) => (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        {minus ? "−" : ""}
        {money(value)}
      </span>
    </div>
  );
  return (
    <div className="space-y-1 text-slate-800">
      <Row label="Lease credit (card money held)" value={m.creditCents} />
      {m.cardTodayCents > 0 && <Row label="Card fares this lease day" value={m.cardTodayCents} />}
      {m.unpaidCents > 0 && <Row label="Unpaid lease (envelopes)" value={m.unpaidCents} minus />}
      <Row label="Final day lease" value={m.finalLeaseCents} minus />
      <div className="border-t my-1" />
      <Row label="Left after final day" value={Math.max(0, base - m.finalLeaseCents)} bold />
      {m.payoutCents > 0 ? (
        <Row label={`Check: ${m.pct}% of that`} value={m.payoutCents} bold />
      ) : (
        <p className="font-bold">No check.{m.owedAfterCents > 0 ? ` He owes ${money(m.owedAfterCents)}.` : ""}</p>
      )}
    </div>
  );
}

/** Close out a driver who quit or was let go: preview the check, then confirm. */
export default function CloseOutModal({ driver, onClose }) {
  const [m, setM] = useState(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    preview({ uid: driver.id })
      .then((r) => setM(r.data))
      .catch((e) => setMsg(e?.message || "Couldn't load his balance."));
  }, [driver.id]);

  async function confirm() {
    setBusy(true);
    setMsg("");
    try {
      const r = await closeOut({ uid: driver.id, reason, note });
      setDone(r.data);
    } catch (e) {
      setMsg(e?.message || "Couldn't close out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-xl">
          Close out Car {driver.carNumber} &middot; {driver.name}
        </p>
        {done ? (
          <>
            <CloseOutLines m={done} />
            <p className="text-emerald-700 font-semibold">Closed out. He's off the board and can't sign in as a driver.</p>
            <Link to={`/admin/payouts/${done.payoutId}`} className="block text-center rounded-xl py-3 font-bold bg-navy-950 text-white">
              Statement{done.payoutCents > 0 ? " & record the check" : ""}
            </Link>
          </>
        ) : !m ? (
          <p className="text-slate-500">{msg || "Working out his balance…"}</p>
        ) : (
          <>
            <CloseOutLines m={m} />
            {m.olderDaysSettled > 0 && (
              <p className="text-xs text-slate-500">Includes {m.olderDaysSettled} earlier lease day(s) that hadn&apos;t settled yet.</p>
            )}
            <div className="flex gap-2">
              {[
                ["quit", "He quit"],
                ["fired", "Let go"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setReason(k)}
                  className={`flex-1 rounded-xl py-2.5 font-bold border-2 ${reason === k ? "border-navy-950 bg-navy-950 text-white" : "border-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full border rounded-xl px-3 py-2" />
            <p className="text-xs text-slate-500">
              The {m.pct}% rule should be in his signed lease agreement. Final: he comes off the board and loses driver access.
            </p>
            <button disabled={busy || !reason} onClick={confirm} className="w-full rounded-xl py-3 font-bold bg-red-600 text-white disabled:opacity-40">
              Close out
            </button>
          </>
        )}
        {msg && m && <p className="text-red-600 text-sm">{msg}</p>}
        <button onClick={onClose} className="w-full rounded-xl py-2.5 font-semibold border border-slate-300">
          {done ? "Done" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
