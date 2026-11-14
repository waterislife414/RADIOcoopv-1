import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { BRAND } from "../../config/constants";
import { isAutoDispatch } from "../../../functions/lib/dispatchCore.mjs";

const setMode = httpsCallable(functions, "setDispatchMode");
const TZ = BRAND.dispatch?.timeZone || "America/New_York";
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MODES = [
  { id: "manual", label: "Manual", hint: "Dispatcher sends every call." },
  { id: "auto", label: "Auto", hint: "The app offers calls to drivers. You can still step in." },
  { id: "scheduled", label: "Scheduled", hint: "Auto during the hours below, manual the rest." },
];

/** Manual / Auto / Scheduled switch for the dispatcher. */
export default function DispatchModePanel() {
  const [saved, setSaved] = useState(null);
  const [mode, setModeState] = useState("manual");
  const [windows, setWindows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(
    () =>
      onSnapshot(doc(db, "settings", "dispatch"), (s) => {
        const d = s.data() || { mode: "manual", windows: [] };
        setSaved(d);
        setModeState(d.mode || "manual");
        setWindows(d.windows || []);
      }),
    []
  );
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const autoNow = saved ? isAutoDispatch(saved, now, TZ) : false;
  const dirty = saved && (mode !== (saved.mode || "manual") || JSON.stringify(windows) !== JSON.stringify(saved.windows || []));

  async function save(nextMode = mode) {
    setBusy(true);
    setMsg("");
    try {
      const res = await setMode({ mode: nextMode, windows });
      setMsg(res.data.started ? `Sent ${res.data.started} waiting call${res.data.started === 1 ? "" : "s"} to drivers.` : "Saved.");
    } catch (e) {
      setMsg(e?.message || "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const editWindow = (i, patch) => setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-bold text-xl text-slate-700">Dispatch</h2>
        <span
          className={`text-sm font-bold px-3 py-1 rounded-full ${autoNow ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
        >
          {autoNow ? "● Auto right now" : "Manual right now"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            disabled={busy}
            onClick={() => {
              setModeState(m.id);
              if (m.id !== "scheduled") save(m.id);
              else if (!windows.length) setWindows([{ days: [0, 1, 2, 3, 4, 5, 6], start: "22:00", end: "06:00" }]);
            }}
            className={`rounded-xl py-3 font-bold border-2 ${mode === m.id ? "border-navy-950 bg-navy-950 text-white" : "border-slate-200 text-slate-700"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">{MODES.find((m) => m.id === mode)?.hint}</p>

      {mode === "scheduled" && (
        <div className="space-y-2">
          {windows.map((w, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap border border-slate-200 rounded-xl p-2">
              <div className="flex gap-1">
                {DAYS.map((label, d) => {
                  const on = w.days.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => editWindow(i, { days: on ? w.days.filter((x) => x !== d) : [...w.days, d].sort() })}
                      className={`h-8 w-8 rounded-full text-sm font-bold ${on ? "bg-navy-950 text-white" : "bg-slate-100 text-slate-500"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <input type="time" value={w.start} onChange={(e) => editWindow(i, { start: e.target.value })} className="border rounded-lg px-2 py-1" />
              <span className="text-slate-500">to</span>
              <input type="time" value={w.end} onChange={(e) => editWindow(i, { end: e.target.value })} className="border rounded-lg px-2 py-1" />
              <button onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))} className="ml-auto text-sm text-red-600 font-semibold">
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => setWindows((ws) => [...ws, { days: [1, 2, 3, 4, 5], start: "18:00", end: "06:00" }])}
              className="text-sm font-semibold text-blue-700"
            >
              + Add hours
            </button>
            <p className="text-xs text-slate-500 self-center">Days are when the hours start. 10 PM&ndash;6 AM on Friday runs into Saturday morning.</p>
          </div>
          {dirty && (
            <button disabled={busy} onClick={() => save()} className="w-full rounded-xl py-3 font-bold bg-gold-400 text-navy-950">
              Save schedule
            </button>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </div>
  );
}
