import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { BRAND } from "../../config/constants";

const answer = httpsCallable(functions, "answerApproval");
const REPEAT_MS = (BRAND.dispatch?.approvalRepeatSeconds ?? 120) * 1000;

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    // No sound available: the pop-up still shows.
  }
}

/** Over every dispatcher page: "Car 44 needs your permission." Repeats every 2 minutes until answered. */
export default function ApprovalPopup() {
  const [reqs, setReqs] = useState([]);
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState("");
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [driverPhone, setDriverPhone] = useState(null);
  const lastBeep = useRef(0);

  useEffect(() => {
    const a = onSnapshot(query(collection(db, "approval_requests"), where("status", "==", "pending")), (s) =>
      setReqs(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => x.createdAtMs - y.createdAtMs))
    );
    const b = onSnapshot(collection(db, "zones"), (s) => setZones(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => {
      a();
      b();
    };
  }, []);

  const r = reqs[0] || null;
  useEffect(() => {
    if (!r) {
      setDriverPhone(null);
      return undefined;
    }

    // Fetch driver phone
    const driverRef = doc(db, "users", r.uid);
    const unsubDriver = onSnapshot(driverRef, (docSnap) => {
      if (docSnap.exists()) {
        setDriverPhone(docSnap.data().phone || null);
      } else {
        setDriverPhone(null);
      }
    });

    setZoneId(r.zoneId);
    setDenying(false);
    setReason("");
    setErr("");
    const ring = () => {
      if (Date.now() - lastBeep.current > REPEAT_MS - 1000) {
        lastBeep.current = Date.now();
        beep();
      }
    };
    ring();
    const t = setInterval(ring, 5000);
    return () => {
      clearInterval(t);
      unsubDriver();
    };
  }, [r?.id, r?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null;
  async function send(decision) {
    setBusy(true);
    setErr("");
    try {
      await answer({ requestId: r.id, decision, zoneId, reason });
    } catch (e) {
      setErr(e?.message || "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }
  const g = r.gps;
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" role="alertdialog" aria-label="Driver needs permission" data-testid="approval-popup">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 shadow-2xl border-4 border-amber-400">
        <p className="text-2xl font-extrabold text-slate-900">Car {r.carNumber} needs your permission.</p>
        <p className="text-lg text-slate-700">
          {r.name ? `${r.name} ` : "He "}needs your permission to Check Ready in <b>{zones.find((z) => z.id === zoneId)?.label || r.zoneLabel}</b>.
        </p>
        {driverPhone && (
          <p className="flex justify-end -mt-1">
            <a href={`tel:${String(driverPhone).replace(/[^\d+]/g, "")}`} className="inline-flex items-center text-blue-700 hover:underline font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.18.448l-.5.869a11.125 11.125 0 0 1-7.877-7.877l.868-.5c.393-.278.558-.74.448-1.18L3.652 3.522a2.25 2.25 0 0 0-1.091-.852H2.25Z" />
              </svg>
              Call {r.name || `Car ${r.carNumber}`} at {driverPhone}
            </a>
          </p>
        )}
        {r.note && <p className="rounded-xl bg-slate-100 px-3 py-2 text-slate-800">&ldquo;{r.note}&rdquo;</p>}
        <p className="text-sm text-slate-600">
          {r.reason ? `${r.reason} ` : ""}
          {g ? (
            <>
              Phone last placed him at {g.lat?.toFixed(4)}, {g.lng?.toFixed(4)} (&plusmn;{g.accuracy ?? "?"} m, {g.ageSec ?? "?"} s old).{" "}
              <a className="text-blue-700 underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${g.lat},${g.lng}`}>
                See on map
              </a>
            </>
          ) : (
            "His phone has no GPS fix."
          )}
        </p>
        {reqs.length > 1 && <p className="text-sm font-semibold text-amber-700">{reqs.length - 1} more waiting after this one.</p>}
        {denying ? (
          <>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not? (he'll see this)" className="w-full border border-slate-300 rounded-xl px-3 py-3 text-base" aria-label="Reason" />
            <div className="flex gap-2">
              <button disabled={busy || reason.trim().length < 3} onClick={() => send("deny")} className="flex-1 min-h-[52px] rounded-xl bg-red-600 text-white font-bold disabled:opacity-50">
                Send &ldquo;No&rdquo;
              </button>
              <button onClick={() => setDenying(false)} className="min-h-[52px] px-4 rounded-xl bg-slate-200 font-semibold">
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="w-full border border-slate-300 rounded-xl px-3 py-3 text-base" aria-label="Zone">
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => send("approve")} className="flex-1 min-h-[56px] rounded-xl bg-emerald-600 text-white font-extrabold text-lg disabled:opacity-50" data-testid="approve">
                Approve
              </button>
              <button disabled={busy} onClick={() => setDenying(true)} className="flex-1 min-h-[56px] rounded-xl bg-red-600 text-white font-extrabold text-lg" data-testid="deny">
                Deny
              </button>
            </div>
          </>
        )}
        {err && <p className="text-red-700 font-semibold">{err}</p>}
        <p className="text-xs text-slate-500">Approved cars show &ldquo;OK&apos;d, no GPS&rdquo; on the board for about {BRAND.dispatch?.approvalValidMinutes ?? 60} minutes.</p>
      </div>
    </div>
  );
}
