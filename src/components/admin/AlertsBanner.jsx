import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { ring } from "../../utils/alertSound";

const ackAlert = httpsCallable(functions, "ackAlert");
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Driver emergencies and call problems, pinned to the top of the dispatch desk until handled. */
export default function AlertsBanner() {
  const [alerts, setAlerts] = useState([]);
  const heard = useRef(new Set());

  useEffect(() => {
    const q = query(collection(db, "alerts"), where("status", "==", "open"));
    return onSnapshot(q, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.type === "emergency") - (a.type === "emergency") || b.at - a.at);
      // Sound once for each new emergency.
      list.forEach((a) => {
        if (!heard.current.has(a.id)) {
          heard.current.add(a.id);
          if (a.type === "emergency" && Date.now() - a.at < 120000) ring(4);
        }
      });
      setAlerts(list);
    });
  }, []);

  if (!alerts.length) return null;
  return (
    <div className="space-y-2" role="alert">
      {alerts.map((a) => {
        const sos = a.type === "emergency";
        const isProblem = a.type === "driver_problem";
        return (
          <div key={a.id} className={`rounded-2xl border-2 p-4 ${sos ? "border-red-500 bg-red-600 text-white animate-pulse" : isProblem ? "border-amber-500 bg-amber-100 text-slate-900" : "border-amber-400 bg-amber-50 text-slate-900"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className={`font-extrabold text-lg ${sos ? "" : "text-amber-900"}`}>
                  {sos ? "\u{1F6A8} " : isProblem ? "🔧 " : "⚠️ "}
                  {a.label || (isProblem ? "Driver reported a problem" : "Alert")}
                </p>
                <p className="font-semibold">
                  Car {a.carNumber || "?"} &middot; {a.driverName || "driver"} &middot; {time(a.at)}
                </p>
                {(a.note || a.message) && <p className="mt-1">&ldquo;{a.note || a.message}&rdquo;</p>}
              </div>
              <div className="flex gap-2">
                {a.lat != null && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`min-h-[44px] px-4 rounded-xl font-bold flex items-center ${sos ? "bg-white text-red-700" : "bg-white border-2 border-amber-400"}`}
                  >
                    Map
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => ackAlert({ id: a.id }).catch(() => {})}
                  className={`min-h-[44px] px-4 rounded-xl font-bold ${sos ? "bg-navy-950 text-white" : "bg-navy-950 text-white"}`}
                >
                  Handled
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
