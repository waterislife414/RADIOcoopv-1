import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import StoredImage from "../components/StoredImage";
import { REPAIR_ITEMS, URGENCY, TYPES, PHOTO_SLOTS, FLUIDS, FLUID_ANSWERS, CHECKS } from "../../functions/lib/inspectionCore.mjs";

const updateWorkOrder = httpsCallable(functions, "updateWorkOrder");
const createWorkOrder = httpsCallable(functions, "createWorkOrder");
const setShopAccess = httpsCallable(functions, "setShopAccess");

const STATUS = { open: "Open", parts_ordered: "Parts ordered", scheduled: "Scheduled", done: "Done" };
const URGENCY_STYLE = { now: "bg-red-600 text-white", soon: "bg-amber-400 text-navy-950", watch: "bg-slate-200 text-slate-800" };
const RANK = { now: 0, soon: 1, watch: 2 };
const when = (ms) => (ms ? new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

function WorkOrderCard({ wo }) {
  const [notes, setNotes] = useState(wo.shopNotes || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save(patch) {
    setBusy(true);
    setMsg("");
    try {
      await updateWorkOrder({ id: wo.id, ...patch });
    } catch (e) {
      setMsg(e?.message || "Couldn't save.");
    }
    setBusy(false);
  }
  return (
    <div className={`rounded-2xl border-2 p-4 bg-white ${wo.urgency === "now" && wo.status !== "done" ? "border-red-500" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-display font-bold text-slate-900">Car {wo.carNumber}</p>
          <p className="text-lg font-bold text-slate-800">{wo.item}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${URGENCY_STYLE[wo.urgency] || URGENCY_STYLE.soon}`}>{URGENCY[wo.urgency] || "Fix soon"}</span>
      </div>
      <p className="text-base text-slate-700 mt-2">{wo.description}</p>
      {wo.photo && <StoredImage path={wo.photo} alt={wo.item} className="mt-3 w-full h-40 rounded-xl" />}
      <p className="text-sm text-slate-600 mt-2">
        Reported by {wo.reportedBy?.name || "—"} &middot; {when(wo.createdAt)}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {Object.entries(STATUS).map(([k, label]) => (
          <button
            key={k}
            type="button"
            disabled={busy}
            aria-pressed={wo.status === k}
            onClick={() => save({ status: k })}
            className={`min-h-[44px] rounded-xl border-2 text-sm font-bold ${wo.status === k ? "border-navy-950 bg-navy-950 text-white" : "border-slate-300 text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shop notes (parts, price, when)" className="flex-1 min-h-[44px] border-2 border-slate-300 rounded-xl px-3" />
        <button type="button" disabled={busy || notes === (wo.shopNotes || "")} onClick={() => save({ shopNotes: notes })} className="min-h-[44px] px-4 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-40">
          Save
        </button>
      </div>
      {msg && <p className="text-sm text-red-700 mt-1">{msg}</p>}
    </div>
  );
}

function AddWorkOrder({ defaultCar }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ carNumber: defaultCar || "", item: REPAIR_ITEMS[0], description: "", urgency: "soon" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-[48px] px-5 rounded-xl bg-navy-950 text-white font-bold">
        + Add a repair
      </button>
    );
  }
  async function add() {
    setBusy(true);
    setMsg("");
    try {
      await createWorkOrder(f);
      setOpen(false);
      setF({ ...f, description: "" });
    } catch (e) {
      setMsg(e?.message || "Couldn't add it.");
    }
    setBusy(false);
  }
  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 space-y-2 w-full">
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <input value={f.carNumber} onChange={(e) => setF({ ...f, carNumber: e.target.value })} placeholder="Car #" className="min-h-[44px] border-2 border-slate-300 rounded-xl px-3" />
        <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} className="min-h-[44px] border-2 border-slate-300 rounded-xl px-3">
          {REPAIR_ITEMS.map((i) => <option key={i}>{i}</option>)}
        </select>
      </div>
      <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What needs doing" className="w-full border-2 border-slate-300 rounded-xl px-3 py-2" />
      <select value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value })} className="w-full min-h-[44px] border-2 border-slate-300 rounded-xl px-3">
        {Object.entries(URGENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={add} className="min-h-[44px] px-5 rounded-xl bg-blue-600 text-white font-bold">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-5 rounded-xl border-2 border-slate-300 font-bold">Cancel</button>
      </div>
    </div>
  );
}

function InspectionHistory({ car }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!car) return;
    const q = query(collection(db, "vehicle_inspections"), where("carNumber", "==", String(car)), orderBy("at", "desc"), limit(20));
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [car]);
  if (!car) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-slate-800">Car {car} &middot; inspection history</h2>
      {!list.length && <p className="text-slate-600">No inspections yet.</p>}
      {list.map((i) => (
        <details key={i.id} className="rounded-2xl border-2 border-slate-200 bg-white">
          <summary className="cursor-pointer list-none px-4 min-h-[56px] flex items-center justify-between gap-2">
            <span className="font-bold text-slate-800">{TYPES[i.type] || i.type}</span>
            <span className="text-sm text-slate-600">{i.driverName} &middot; {when(i.at)}{i.mileage ? ` · ${i.mileage.toLocaleString()} mi` : ""}</span>
          </summary>
          <div className="px-4 pb-4 space-y-3 text-sm text-slate-700">
            {Object.keys(i.photos || {}).length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {PHOTO_SLOTS.filter((s) => i.photos[s.id]).map((s) => (
                  <figure key={s.id}>
                    <StoredImage path={i.photos[s.id]} alt={s.label} className="w-full h-20 rounded-lg" />
                    <figcaption className="text-xs text-slate-600 mt-0.5">{s.label}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {i.video && <p>&#127909; Walk-around video saved.</p>}
            {(i.damages || []).map((d, n) => (
              <div key={n} className="flex gap-3 items-start">
                <StoredImage path={d.photo} alt={d.area} className="w-20 h-16 rounded-lg shrink-0" />
                <p>
                  <strong>{d.area}</strong> &mdash; {d.description || "damage"}{" "}
                  <span className={d.preExisting ? "text-slate-600" : "text-red-700 font-bold"}>{d.preExisting ? "(already there)" : "(new)"}</span>
                </p>
              </div>
            ))}
            {i.fluids && Object.keys(i.fluids).length > 0 && (
              <p>
                <strong>Fluids:</strong> {FLUIDS.map((f) => `${f.label}: ${FLUID_ANSWERS[i.fluids[f.id]] || "—"}`).join(" · ")}
              </p>
            )}
            {i.checks && Object.values(i.checks).includes("problem") && (
              <p>
                <strong>Problems:</strong> {CHECKS.filter((c) => i.checks[c.id] === "problem").map((c) => c.label).join(", ")}
              </p>
            )}
            {i.type === "shift" && <p>No new damage reported at start of shift.</p>}
            <p className="text-slate-600">Signed: {i.signedName}</p>
          </div>
        </details>
      ))}
    </section>
  );
}

function MechanicAccess() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(allow) {
    const who = email.trim();
    setMsg("");
    setBusy(true);
    try {
      await setShopAccess({ email: who, allow });
      setMsg(
        allow
          ? `${who} has shop access. They need to sign out and sign back in to see the shop board.`
          : `${who} no longer has shop access. It ends the next time they sign in (or within the hour).`
      );
      setEmail("");
    } catch (e) {
      setMsg(e?.message || (allow ? "Couldn't give access." : "Couldn't remove access."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 p-4">
      <p className="font-bold text-slate-800">Give a mechanic access</p>
      <p className="text-sm text-slate-600">They sign up with their email first, then you add it here.</p>
      <div className="flex flex-wrap gap-2 mt-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mechanic@email.com"
          aria-label="Mechanic's email"
          className="flex-1 min-w-[12rem] min-h-[44px] border-2 border-slate-300 rounded-xl px-3"
        />
        <button type="button" disabled={busy || !email.trim()} onClick={() => change(true)} className="min-h-[44px] px-4 rounded-xl bg-navy-950 text-white font-bold disabled:opacity-50">
          Give access
        </button>
        <button
          type="button"
          disabled={busy || !email.trim()}
          onClick={() => change(false)}
          className="min-h-[44px] px-4 rounded-xl border-2 border-red-300 text-red-700 font-bold disabled:opacity-50"
        >
          Remove access
        </button>
      </div>
      {msg && <p className="text-sm text-slate-700 mt-2" role="status">{msg}</p>}
    </div>
  );
}

/** Central list of repairs reported by drivers, for the mechanics. */
export default function ShopBoard() {
  const { currentUser, isShop, isAdmin, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const car = params.get("car") || "";
  const [filter, setFilter] = useState("active");
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!isShop) return;
    const q = query(collection(db, "work_orders"), orderBy("createdAt", "desc"), limit(300));
    return onSnapshot(q, (s) => setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [isShop]);

  const shown = useMemo(
    () =>
      orders
        .filter((o) => (filter === "active" ? o.status !== "done" : filter === "done" ? o.status === "done" : true))
        .filter((o) => !car || String(o.carNumber) === car)
        .sort((a, b) => (a.status === "done") - (b.status === "done") || RANK[a.urgency] - RANK[b.urgency] || b.createdAt - a.createdAt),
    [orders, filter, car]
  );
  const cars = useMemo(() => [...new Set(orders.filter((o) => o.status !== "done").map((o) => String(o.carNumber)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [orders]);

  if (loading) return null;
  if (!currentUser) return <Navigate to="/sign-in" replace />;
  if (!isShop) {
    return <div className="p-8 text-center text-lg">This page is for the office and the shop. <Link className="text-blue-700 underline" to="/">Home</Link></div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 pt-14 pb-10">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold tracking-widest text-slate-600 uppercase">Repairs reported by drivers</p>
            <h1 className="font-display text-3xl font-bold text-slate-900">&#128295; Shop Board</h1>
          </div>
          {isAdmin && <Link to="/admin/lease" className="font-bold text-blue-700 underline">Lick desk &rarr;</Link>}
        </div>

        <div className="flex gap-2 flex-wrap">
          {[["active", "Still to do"], ["done", "Done"], ["all", "All"]].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`min-h-[44px] px-4 rounded-full font-bold border-2 ${filter === k ? "bg-navy-950 border-navy-950 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {label}
            </button>
          ))}
          <select
            aria-label="Car"
            value={car}
            onChange={(e) => setParams(e.target.value ? { car: e.target.value } : {})}
            className="min-h-[44px] px-3 rounded-full border-2 border-slate-300 bg-white font-bold"
          >
            <option value="">All cars</option>
            {[...new Set([...cars, car].filter(Boolean))].map((c) => <option key={c} value={c}>Car {c}</option>)}
          </select>
        </div>

        <AddWorkOrder defaultCar={car} />

        {!shown.length && <p className="text-slate-600 text-lg">Nothing here. &#127881;</p>}
        <div className="grid gap-4">
          {shown.map((wo) => (
            <WorkOrderCard key={wo.id + wo.updatedAt} wo={wo} />
          ))}
        </div>

        <InspectionHistory car={car} />
        {isAdmin && <MechanicAccess />}
      </div>
    </div>
  );
}
