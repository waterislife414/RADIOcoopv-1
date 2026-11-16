import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";

const act = httpsCallable(functions, "dispatcherBoardAction");
const addRadio = httpsCallable(functions, "addRadioCar");

/**
 * Dispatcher moves a car on the board, puts it on a radio call, or adds a
 * radio-only car (car = null). The dispatcher can step in any time; the one
 * thing he can't do is put an app driver in a zone his GPS says he isn't in.
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
              {car.radioOnly && <span className="ml-2 text-sm font-semibold text-slate-500">radio</span>}
            </p>
            {gpsLabel && !car.radioOnly && <p className="text-sm text-slate-600">GPS: {gpsLabel}</p>}
            {radioCall && (
              <p className="text-sm text-amber-700">
                {"\u{1F4FB}"} On a radio call{car.radioCall?.note ? `: ${car.radioCall.note}` : ""}. Moving him clears it.
              </p>
            )}
            {onCall && !radioCall && <p className="text-sm text-amber-700">On an app call. Any change you make takes him off it: if he hasn&rsquo;t picked up yet, the ride comes back to you to re-send.</p>}
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
                      Put him in {confirmMove.gpsZoneLabel}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
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
            {car.status !== "offline" && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Radio call pickup (optional)"
                  maxLength={120}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base"
                />
                <button disabled={busy} onClick={() => run(act, { uid: car.id, action: "radio_call", note })} className="w-full rounded-xl py-3 font-bold bg-emerald-600 text-white">
                  {"\u{1F4FB}"} Gave him a radio call
                </button>
              </div>
            )}
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
