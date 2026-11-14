import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { BRAND } from "../../config/constants";
import { INCENTIVE_DEFAULTS } from "../../../functions/lib/dispatchCore.mjs";

const INC = { ...INCENTIVE_DEFAULTS, ...(BRAND.dispatch?.incentives || {}) };
const add = httpsCallable(functions, "addDriverIncident");
const TYPES = [
  ["accident", "Accident (his fault)"],
  ["no_show", "Didn't show up"],
  ["complaint", "Complaint"],
  ["write_up", "Write-up"],
  ["other", "Other note"],
];

/** Office adds an incident to a driver's record (shows on his profile, lowers his score). */
export default function AddIncident({ driver, onDone }) {
  const [type, setType] = useState("accident");
  const [points, setPoints] = useState(INC.penaltyPoints.accident);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const r = await add({ uid: driver.id, type, note, points });
      onDone?.(r.data);
    } catch (e) {
      setMsg(e?.message || "Couldn't save.");
      setBusy(false);
    }
  }
  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2 mt-2">
      <p className="font-semibold text-slate-700">Add to Car {driver.carNumber}&apos;s record</p>
      <div className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPoints(INC.penaltyPoints[e.target.value]);
          }}
          className="border rounded-lg px-2 py-2"
        >
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className="text-sm text-slate-600 flex items-center gap-1">
          Points off
          <input type="number" min="0" max="100" value={points} onChange={(e) => setPoints(e.target.value)} className="w-20 border rounded-lg px-2 py-2" />
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened (he will see this)" className="w-full border rounded-lg px-2 py-2" />
      <p className="text-xs text-slate-500">
        Stays on his profile for {INC.scoreWindowDays} days. Under {INC.lowScore} points he gets no app calls for {INC.lowScoreHoldHours} hours.
      </p>
      <div className="flex gap-2">
        <button disabled={busy || !note.trim()} onClick={save} className="rounded-lg px-4 py-2 font-bold bg-red-600 text-white disabled:opacity-40">
          Add to record
        </button>
        <button onClick={() => onDone?.(null)} className="rounded-lg px-4 py-2 font-semibold border">
          Cancel
        </button>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
