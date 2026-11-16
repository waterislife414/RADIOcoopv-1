import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { collectDevice } from "../../utils/deviceInfo";

const report = httpsCallable(functions, "reportProblem");
const AREAS = [
  ["check_ready", "Check Ready"],
  ["go_online", "Go Online"],
  ["payment", "Payment"],
  ["calling", "Calling"],
  ["map_address", "Map or address"],
  ["other", "Something else"],
];

/**
 * "Report a problem / Ask dispatch". Always reachable from the driver app.
 * Saves a ticket with the device details attached and, for Check Ready,
 * can ask the dispatcher to place him (a glitch only: a permission that is
 * off has to be turned back on).
 */
export default function AskDispatch({ onClose, defaultArea = "other", reason = "", zones = [], defaultZoneId = "", gps = null, onAsked }) {
  const [area, setArea] = useState(defaultArea);
  const [note, setNote] = useState("");
  const [zoneId, setZoneId] = useState(defaultZoneId || zones[0]?.id || "");
  const [askPlace, setAskPlace] = useState(defaultArea === "check_ready");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  async function send() {
    setBusy(true);
    setErr("");
    try {
      const device = await collectDevice({ fix: gps?.fix, gpsState: gps?.gps, zoneId: gps?.gpsZoneId || "" });
      const ask = area === "check_ready" && askPlace ? { type: "check_ready", zoneId, reason } : null;
      const res = await report({ area, note: note || reason, device, ask });
      setDone(res.data);
      if (res.data.approvalId) onAsked?.(res.data.approvalId);
    } catch (e) {
      setErr((e?.code !== "functions/internal" && e?.message) || "Couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Report a problem or ask dispatch" data-testid="ask-dispatch">
      <div className="w-full max-w-md rounded-3xl bg-navy-900 border border-white/15 p-5 space-y-3 text-white max-h-[92vh] overflow-y-auto">
        {done ? (
          <>
            <p className="text-2xl font-display font-bold">{done.approvalId ? "Sent to dispatch." : "Thanks, we've got it."}</p>
            <p className="text-lg text-slate-200">
              {done.approvalId
                ? "Stay put. Dispatch will answer on this screen."
                : "Your report went to the office with your phone's details attached."}
            </p>
            <button type="button" onClick={onClose} className="w-full min-h-[52px] rounded-2xl bg-gold-400 text-navy-950 font-bold text-lg">
              OK
            </button>
          </>
        ) : (
          <>
            <p className="text-xs font-bold tracking-widest text-gold-400 uppercase">Report a problem / Ask dispatch</p>
            {reason && <p className="rounded-xl bg-red-500/15 border border-red-400/40 px-3 py-2 text-red-200">{reason}</p>}
            <label className="block text-sm font-semibold text-slate-300">
              What were you trying to do?
              <select value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 w-full rounded-xl bg-white text-navy-950 px-3 py-3 text-base">
                {AREAS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {area === "check_ready" && zones.length > 0 && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                <label className="flex items-start gap-2 text-base">
                  <input type="checkbox" checked={askPlace} onChange={(e) => setAskPlace(e.target.checked)} className="mt-1 h-5 w-5" />
                  <span>Ask dispatch to place me in this zone (my phone isn&apos;t placing me)</span>
                </label>
                {askPlace && (
                  <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="w-full rounded-xl bg-white text-navy-950 px-3 py-3 text-base" aria-label="Zone I am in">
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <label className="block text-sm font-semibold text-slate-300">
              Tell us what happened
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="mt-1 w-full rounded-xl bg-white text-navy-950 px-3 py-2 text-base" />
            </label>
            {err && <p className="text-red-300 font-semibold">{err}</p>}
            <button type="button" disabled={busy || (!note && !reason && !(area === "check_ready" && askPlace))} onClick={send} className="w-full min-h-[56px] rounded-2xl bg-gold-400 text-navy-950 font-extrabold text-lg disabled:opacity-50">
              {busy ? "Sending…" : area === "check_ready" && askPlace ? "Ask dispatch" : "Send report"}
            </button>
            <button type="button" onClick={onClose} className="w-full py-2 text-slate-300 font-semibold">
              Cancel
            </button>
            <p className="text-xs text-slate-400">Your app version, phone, permission settings, last GPS reading and recent errors go with it.</p>
          </>
        )}
      </div>
    </div>
  );
}
