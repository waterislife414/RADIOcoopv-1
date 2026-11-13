import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { isEligible, zoneLine } from "../../../functions/lib/dispatchCore.mjs";

const assign = httpsCallable(functions, "dispatcherAssign");
const STATUS = { ready: "Waiting", moving: "Moving", offline: "Off the board", offered: "Being offered", on_call: "On a call" };

/** Pick the car for a ride (or reassign one). */
export default function AssignCarModal({ ride, board, zones, onClose }) {
  const [drivers, setDrivers] = useState({});
  const [vehicles, setVehicles] = useState({});
  const [busy, setBusy] = useState(null);
  const [force, setForce] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const a = onSnapshot(query(collection(db, "drivers"), where("active", "==", true)), (s) =>
      setDrivers(Object.fromEntries(s.docs.map((d) => [d.id, d.data()])))
    );
    const b = onSnapshot(collection(db, "vehicles"), (s) => setVehicles(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));
    return () => {
      a();
      b();
    };
  }, []);

  const zoneLabel = useCallback((id) => zones.find((z) => z.id === id)?.label || "", [zones]);
  const groups = useMemo(() => {
    const inLine = ride.zoneId ? zoneLine(board, ride.zoneId).filter((d) => d.dot === "red") : [];
    const lineIds = new Set(inLine.map((d) => d.id));
    const byCar = (a, b) => String(a.carNumber).localeCompare(String(b.carNumber), undefined, { numeric: true });
    const free = board.filter((d) => !lineIds.has(d.id) && ["ready", "moving"].includes(d.status)).sort(byCar);
    const off = board.filter((d) => d.status === "offline").sort(byCar);
    return [
      { title: ride.zoneId ? `Next up in ${zoneLabel(ride.zoneId)}` : null, cars: inLine },
      { title: "Other free cars", cars: free },
      { title: "Off the board", cars: off },
    ].filter((g) => g.cars.length);
  }, [board, ride.zoneId, zoneLabel]);

  function problem(d) {
    if (d.radioOnly) return null;
    const driver = drivers[d.id];
    if (!driver) return null;
    return isEligible({ ...driver, ...d }, ride, vehicles) ? null : "Missing a certification or van for this ride";
  }

  async function pick(uid, forced = false) {
    setBusy(uid ?? "none");
    setMsg("");
    try {
      await assign({ rideId: ride.id, uid, force: forced });
      onClose();
    } catch (e) {
      const text = e?.message || "Couldn't assign.";
      if (text.startsWith("NEEDS_FORCE")) setForce({ uid, text: text.replace("NEEDS_FORCE: ", "") });
      else setMsg(text);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-sm text-slate-500">{ride.status === "dispatched" ? "Change car for" : "Send a car to"}</p>
          <p className="font-bold text-lg">{ride.pickup}</p>
          {ride.zoneId && <p className="text-sm text-slate-500">{zoneLabel(ride.zoneId)}</p>}
        </div>

        {force && (
          <div className="border-2 border-amber-400 bg-amber-50 rounded-xl p-3 space-y-2">
            <p className="text-amber-900">{force.text}</p>
            <div className="flex gap-2">
              <button onClick={() => pick(force.uid, true)} className="flex-1 rounded-lg py-2 font-bold bg-amber-500 text-white">
                Send anyway
              </button>
              <button onClick={() => setForce(null)} className="flex-1 rounded-lg py-2 font-bold bg-slate-100">
                Cancel
              </button>
            </div>
          </div>
        )}

        {groups.length === 0 && <p className="text-slate-500">No cars on the board.</p>}
        {groups.map((g) => (
          <div key={g.title} className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{g.title}</p>
            {g.cars.map((d) => {
              const warn = problem(d);
              return (
                <button
                  key={d.id}
                  disabled={!!busy || d.id === ride.driverId}
                  onClick={() => pick(d.id)}
                  className="w-full text-left flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5 hover:border-slate-400 disabled:opacity-50"
                >
                  <span className="font-bold text-lg w-16">Car {d.carNumber}</span>
                  <span className="text-sm text-slate-600 flex-1">
                    {STATUS[d.status] || d.status}
                    {d.zoneId ? ` · ${zoneLabel(d.zoneId)}` : ""}
                    {d.radioOnly ? " · radio" : ""}
                    {warn && <span className="block text-amber-700">{warn}</span>}
                  </span>
                  {busy === d.id && <span className="text-sm">&hellip;</span>}
                </button>
              );
            })}
          </div>
        ))}

        {msg && <p className="text-red-600 text-sm">{msg}</p>}
        <div className="flex gap-2 pt-2">
          {ride.status === "pending" && (
            <button disabled={!!busy} onClick={() => pick(null)} className="flex-1 rounded-xl py-3 font-semibold bg-slate-100 text-slate-700">
              Dispatch without a car
            </button>
          )}
          <button onClick={onClose} className="flex-1 rounded-xl py-3 font-semibold border border-slate-300">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
