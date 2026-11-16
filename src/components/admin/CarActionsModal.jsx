import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";

const act = httpsCallable(functions, "dispatcherBoardAction");
const addRadio = httpsCallable(functions, "addRadioCar");

/**
 * Dispatcher moves a car on the board, puts it on a radio call, or adds a
 * radio-only car (car = null).
 */
export default function CarActionsModal({ car, zones, gps = null, onClose }) {
  const [zoneId, setZoneId] = useState(car?.zoneId || gps?.zoneId || zones[0]?.id || "");
  const [carNumber, setCarNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmMove, setConfirmMove] = useState(null);

  async function run(fn, data) {
    setBusy(true);
    setMsg("");
    try {
      await fn(data);
      onClose();
    } catch (e) {
      if (e?.details?.gpsBlocked) setConfirmMove({ data, text: e.message, gpsZoneId: e.details.gpsZoneId, gpsZoneLabel: e.details.gpsZoneLabel });
      else setMsg(e?.message || "Couldn't do that.");
      setBusy(false);
    }
  }

  const onCall = car?.status === "on_call";
  const radioCall = onCall && !car?.rideId;
  const gpsLabel = gps?.zoneId ? zones.find((z) => z.id === gps.zoneId)?.label : null;
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
              {car.radioOnly && <span className="ml-2 text-sm font-semibold text-slate-500">Radio</span>}
            </p>
            {gpsLabel && !car.radioOnly && <p className="text-sm text-slate-600">GPS: {gpsLabel}</p>}
            {radioCall && <p className="text-sm text-amber-700">On radio call</p>}
            {onCall && !radioCall && <p className="text-sm text-amber-700">On app call</p>}
            {confirmMove ? (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2">
                <p className="font-bold text-amber-900">{confirmMove.text}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busy} onClick={() => setConfirmMove(null)} className="rounded-xl py-3 font-bold border-2 border-slate-300 bg-white">
                    OK
                  </button>
                  {confirmMove.gpsZoneId && (
                    <button
                      disabled={busy}
                      onClick={() => run(act, { ...confirmMove.data, zoneId: confirmMove.gpsZoneId })}
                      className="rounded-xl py-3 font-bold bg-amber-500 text-navy-950"
                    >
                      Put in {confirmMove.gpsZoneLabel}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
            {zoneSelect}
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={busy}
                data-testid="car-on-call"
                onClick={() => run(act, { uid: car.id, action: "radio_call", note })}
                className="rounded-xl py-3 font-bold bg-orange-500 text-white"
              >
                On call
              </button>
              <button
                disabled={busy}
                data-testid="car-dropped-ready"
                onClick={() => run(act, { uid: car.id, action: "ready", zoneId })}
                className="rounded-xl py-3 font-bold bg-green-600 text-white"
              >
                Ready
              </button>
              <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "moving" })} className="rounded-xl py-3 font-bold bg-blue-600 text-white">
                Moving
              </button>
              <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "off" })} className="rounded-xl py-3 font-bold bg-red-50 text-red-700">
                Off
              </button>
            </div>
            {car.status !== "offline" && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Radio note (optional)"
                  maxLength={120}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base"
                />
              </div>
            )}
            {car.radioOnly && !onCall && (
              <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "remove" })} className="w-full text-sm font-semibold text-red-600">
                Remove radio car
              </button>
            )}
          </>
        ) : (
          <>
            <p className="font-bold text-xl">Add radio car</p>
            <p className="text-sm text-slate-500">No app driver.</p>
            <input
              value={carNumber}
              onChange={(e) => setCarNumber(e.target.value)}
              placeholder="Car #"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base"
            />
            {zoneSelect}
            <button disabled={busy || !carNumber.trim()} onClick={() => run(addRadio, { carNumber, zoneId })} className="w-full rounded-xl py-3 font-bold bg-navy-950 text-white disabled:opacity-50">
              Add radio car
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
