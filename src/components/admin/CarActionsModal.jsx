import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";

const act = httpsCallable(functions, "dispatcherBoardAction");
const addRadio = httpsCallable(functions, "addRadioCar");

/** Dispatcher moves a car on the board, or adds a radio-only car (car = null). */
export default function CarActionsModal({ car, zones, onClose }) {
  const [zoneId, setZoneId] = useState(car?.zoneId || zones[0]?.id || "");
  const [carNumber, setCarNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run(fn, data) {
    setBusy(true);
    setMsg("");
    try {
      await fn(data);
      onClose();
    } catch (e) {
      setMsg(e?.message || "Couldn't do that.");
      setBusy(false);
    }
  }

  const onCall = car?.status === "on_call";
  const zoneSelect = (
    <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base">
      {zones.map((z) => (
        <option key={z.id} value={z.id}>
          {z.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        {car ? (
          <>
            <p className="font-bold text-xl">
              Car {car.carNumber}
              {car.radioOnly && <span className="ml-2 text-sm font-semibold text-slate-500">radio</span>}
            </p>
            {onCall && <p className="text-sm text-amber-700">On a call. Moving him drops off his fare for him.</p>}
            {zoneSelect}
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "front", zoneId })} className="rounded-xl py-3 font-bold bg-navy-950 text-white">
                Next up
              </button>
              <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "ready", zoneId })} className="rounded-xl py-3 font-bold bg-slate-200">
                Back of line
              </button>
              <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "moving" })} className="rounded-xl py-3 font-bold bg-sky-100 text-sky-800">
                Moving
              </button>
              <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "off" })} className="rounded-xl py-3 font-bold bg-red-50 text-red-700">
                Off the board
              </button>
            </div>
            {car.radioOnly && !onCall && (
              <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "remove" })} className="w-full text-sm font-semibold text-red-600">
                Remove radio car from the board
              </button>
            )}
          </>
        ) : (
          <>
            <p className="font-bold text-xl">Add a radio car</p>
            <p className="text-sm text-slate-500">For a driver without the app. You move him on the board yourself; auto-dispatch skips him.</p>
            <input
              value={carNumber}
              onChange={(e) => setCarNumber(e.target.value)}
              placeholder="Car #"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base"
            />
            {zoneSelect}
            <button disabled={busy || !carNumber.trim()} onClick={() => run(addRadio, { carNumber, zoneId })} className="w-full rounded-xl py-3 font-bold bg-navy-950 text-white disabled:opacity-50">
              Add to back of line
            </button>
          </>
        )}
        {msg && <p className="text-red-600 text-sm">{msg}</p>}
        <button onClick={onClose} className="w-full rounded-xl py-2.5 font-semibold border border-slate-300">
          Close
        </button>
      </div>
    </div>
  );
}
