import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { LEASE_CFG, money } from "../../config/lease";
import { leaseLocked } from "../../../functions/lib/dispatchCore.mjs";

/** Dispatcher heads-up: drivers locked out for an unpaid lease. */
export default function LeaseAlert() {
  const [owing, setOwing] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const off = onSnapshot(query(collection(db, "drivers"), where("leaseOwedCents", ">", 0)), (s) =>
      setOwing(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);
  const locked = owing.filter(
    (d) => d.active !== false && leaseLocked({ owedCents: d.leaseOwedCents, owedPeriodKey: d.leaseOwedPeriodKey, now }, LEASE_CFG)
  );
  if (!locked.length) return null;
  return (
    <Link to="/admin/lease" className="block bg-red-50 border-2 border-red-300 rounded-2xl p-4 text-red-900">
      <span className="font-bold">Lease not paid:</span>{" "}
      {locked.map((d) => `Car ${d.carNumber} (${money(d.leaseOwedCents)})`).join(", ")} &mdash; locked off the board. Open Lease &rarr;
    </Link>
  );
}
