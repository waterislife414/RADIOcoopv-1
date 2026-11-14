import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { WEEKLY_DAYS, inspectionNeeded } from "../../../functions/lib/inspectionCore.mjs";

const DAY = 86400000;
const BTN = "flex items-center justify-center min-h-[52px] rounded-2xl font-bold text-base text-center px-3";

/** Driver home: when the next inspection is due, plus report damage / a problem any time. */
export default function VehicleCheckCard({ driver }) {
  const [vehicle, setVehicle] = useState(null);
  const car = driver.carNumber ? String(driver.carNumber) : null;
  useEffect(() => {
    if (!car) return;
    return onSnapshot(doc(db, "vehicles", car), (s) => setVehicle(s.data() || null), () => {});
  }, [car]);
  if (!car) return null;

  const now = Date.now();
  const needed = inspectionNeeded(driver.inspection, car, now);
  const last = driver.inspection?.lastFullAt;
  const daysLeft = last ? Math.max(0, Math.ceil((last + WEEKLY_DAYS * DAY - now) / DAY)) : 0;
  const status =
    needed === "initial"
      ? { text: "First full inspection needed (360° photos)", cls: "text-amber-300" }
      : needed === "weekly"
        ? { text: "Weekly inspection is due", cls: "text-amber-300" }
        : { text: `Weekly inspection done · next due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, cls: "text-emerald-300" };
  const fullType = needed === "initial" ? "initial" : "weekly";

  return (
    <section className="glass-panel border border-white/10 rounded-2xl p-5 space-y-3" aria-label="Vehicle check">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Vehicle check &middot; Car {car}</p>
          <p className={`text-lg font-bold mt-1 ${status.cls}`}>{status.text}</p>
          {vehicle?.openRepairs > 0 && (
            <p className="text-sm text-slate-300 mt-1">&#128295; {vehicle.openRepairs} repair{vehicle.openRepairs > 1 ? "s" : ""} open at the shop</p>
          )}
        </div>
      </div>
      <Link to={`/driver/inspection?type=${fullType}`} className={`${BTN} w-full ${needed === "initial" || needed === "weekly" ? "bg-gold-400 text-navy-950" : "bg-white/10 text-white"}`}>
        {needed === "initial" ? "Start first inspection" : needed === "weekly" ? "Do weekly inspection" : "Do an inspection now"}
      </Link>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/driver/inspection?type=damage" className={`${BTN} border-2 border-amber-400/70 text-amber-200`}>Report damage</Link>
        <Link to="/driver/inspection?type=repair" className={`${BTN} border-2 border-white/25 text-white`}>Report a problem</Link>
      </div>
    </section>
  );
}
