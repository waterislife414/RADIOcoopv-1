import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { CERT_LABELS } from "../../config/driverCerts";
import { formatPhoneDisplay } from "../../utils/phone";
import CloseOutModal from "../../components/admin/CloseOutModal";
import AddIncident from "../../components/admin/AddIncident";
import { money } from "../../config/lease";

const TABS = ["Drivers", "Certifications", "Fleet", "Payouts"];

function dateInputToMs(value) {
  if (!value) return null;
  // End of the chosen day, local time.
  const d = new Date(`${value}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
function msToDate(ms) {
  return ms ? new Date(ms).toLocaleDateString() : "";
}

// ---------------------------------------------------------------- Drivers

function DriverRow({ driver }) {
  const [closing, setClosing] = useState(false);
  const [incident, setIncident] = useState(false);
  const [car, setCar] = useState(driver.carNumber || "");
  const [msg, setMsg] = useState("");

  async function saveCar() {
    setMsg("");
    try {
      await httpsCallable(functions, "setDriverCar")({ uid: driver.id, carNumber: car });
      setMsg("Car updated.");
    } catch (err) {
      setMsg(err.message || "Could not update car.");
    }
  }

  async function revokeCert(key) {
    if (!window.confirm(`Remove ${CERT_LABELS[key]?.label || key} from Car ${driver.carNumber}?`)) return;
    await updateDoc(doc(db, "drivers", driver.id), { [`certs.${key}`]: deleteField() });
  }

  async function reinstate() {
    await updateDoc(doc(db, "drivers", driver.id), { status: "offline", warnings: 0, warningsClearedAt: Date.now() });
  }

  async function clearWarnings() {
    await updateDoc(doc(db, "drivers", driver.id), { warnings: 0, warningsClearedAt: Date.now() });
  }

  const certs = Object.entries(driver.certs || {});

  return (
    <div className="bg-white rounded-xl p-4 space-y-3 border border-slate-200">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-bold text-lg text-slate-900">
            Car {driver.carNumber} &middot; {driver.name}
          </p>
          <p className="text-sm text-slate-500">
            {formatPhoneDisplay(driver.phone)} &middot; {driver.email}
          </p>
        </div>
        <span
          className={`self-start text-xs font-bold uppercase px-2.5 py-1 rounded-full ${
            driver.status === "suspended"
              ? "bg-red-100 text-red-700"
              : driver.status === "offline" || !driver.status
                ? "bg-slate-100 text-slate-600"
                : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {driver.status || "offline"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {certs.length === 0 && <span className="text-sm text-slate-500">No certifications</span>}
        {certs.map(([key, c]) => (
          <span
            key={key}
            className={`text-sm font-semibold px-2.5 py-1 rounded-full border ${
              c.status === "approved" ? "bg-amber-50 border-gold-400 text-gold-600" : "bg-slate-50 border-slate-300 text-slate-500"
            }`}
          >
            {CERT_LABELS[key]?.icon} {CERT_LABELS[key]?.label || key}
            {c.status !== "approved" && ` (${c.status})`}
            {c.expiresAt ? ` · exp ${msToDate(c.expiresAt)}` : ""}
            <button onClick={() => revokeCert(key)} className="ml-1.5 text-slate-500 hover:text-red-600" aria-label="Remove">
              &times;
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <input
          value={car}
          onChange={(e) => setCar(e.target.value)}
          className="w-20 border-2 border-slate-300 rounded-lg px-2 py-1.5 font-bold"
          aria-label="Car number"
        />
        <button onClick={saveCar} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white font-semibold">
          Change car
        </button>
        <span className="text-slate-500">Score: {driver.score ?? 100}</span>
        <span className="text-slate-500">Warnings: {driver.warnings || 0}</span>
        {driver.warnings > 0 && driver.status !== "suspended" && (
          <button onClick={clearWarnings} className="px-3 py-1.5 rounded-lg bg-slate-100 font-semibold">
            Clear warnings
          </button>
        )}
        {driver.status === "suspended" && (
          <button onClick={reinstate} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold">
            Reinstate
          </button>
        )}
        <button onClick={() => setIncident((v) => !v)} className="px-3 py-1.5 rounded-lg bg-slate-100 font-semibold">
          Add to record&hellip;
        </button>
        <button onClick={() => setClosing(true)} className="ml-auto px-3 py-1.5 rounded-lg text-red-700 font-semibold hover:bg-red-50">
          Close out&hellip;
        </button>
      </div>
      {incident && <AddIncident driver={driver} onDone={() => setIncident(false)} />}
      {closing && <CloseOutModal driver={driver} onClose={() => setClosing(false)} />}
      {msg && <p className="text-sm text-slate-500">{msg}</p>}
    </div>
  );
}

function DriversTab() {
  const [drivers, setDrivers] = useState([]);
  useEffect(
    () =>
      onSnapshot(query(collection(db, "drivers"), where("active", "==", true)), (snap) =>
        setDrivers(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.carNumber).localeCompare(String(b.carNumber), undefined, { numeric: true }))
        )
      ),
    []
  );
  return (
    <div className="space-y-3">
      {drivers.length === 0 && (
        <p className="text-slate-500">No approved drivers yet. Approve applications from the dispatcher screen.</p>
      )}
      {drivers.map((d) => (
        <DriverRow key={d.id} driver={d} />
      ))}
    </div>
  );
}

function PayoutsTab() {
  const [payouts, setPayouts] = useState([]);
  useEffect(
    () =>
      onSnapshot(collection(db, "payouts"), (snap) =>
        setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt))
      ),
    []
  );
  const LABEL = { awaiting_check: "Check to write", paid: "Paid", no_payout: "No check" };
  return (
    <div className="space-y-2">
      {payouts.length === 0 && <p className="text-slate-500">No close-outs yet.</p>}
      {payouts.map((p) => (
        <Link
          key={p.id}
          to={`/admin/payouts/${p.id}`}
          className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3 hover:border-slate-400"
        >
          <span className="font-bold w-20">Car {p.carNumber}</span>
          <span className="flex-1">{p.driverName}</span>
          <span className="text-sm text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</span>
          <span className="font-semibold w-20 text-right">{money(p.payoutCents)}</span>
          <span
            className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${
              p.status === "awaiting_check" ? "bg-amber-100 text-amber-800" : p.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
            }`}
          >
            {LABEL[p.status] || p.status}
            {p.status === "paid" && p.checkNumber ? ` #${p.checkNumber}` : ""}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------- Certifications

function CertRequestCard({ req }) {
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(approve) {
    setBusy(true);
    const batch = writeBatch(db);
    batch.update(doc(db, "certRequests", req.id), {
      status: approve ? "approved" : "denied",
      reviewedAt: serverTimestamp(),
    });
    if (approve) {
      batch.update(doc(db, "drivers", req.uid), {
        [`certs.${req.cert}`]: {
          status: "approved",
          proofUrl: req.proofUrl || "",
          expiresAt: dateInputToMs(expires),
          approvedAt: Date.now(),
        },
      });
    }
    await batch.commit();
  }

  return (
    <div className="bg-white rounded-xl p-4 space-y-3 border border-slate-200">
      <p className="font-bold text-slate-900">
        Car {req.carNumber} &middot; {req.name}
      </p>
      <p className="text-base">
        Wants: <span className="font-semibold">{CERT_LABELS[req.cert]?.icon} {CERT_LABELS[req.cert]?.label}</span>
      </p>
      {req.proofUrl && (
        <a href={req.proofUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold underline text-sm">
          View proof
        </a>
      )}
      <label className="block text-sm text-slate-600">
        Expires (optional)
        <input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          className="block mt-1 border-2 border-slate-300 rounded-lg px-3 py-2"
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => decide(true)}
          disabled={busy}
          className="flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => decide(false)}
          disabled={busy}
          className="px-5 bg-red-50 text-red-700 font-bold rounded-xl disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

function CertificationsTab() {
  const [requests, setRequests] = useState([]);
  useEffect(
    () =>
      onSnapshot(query(collection(db, "certRequests"), where("status", "==", "pending")), (snap) =>
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    []
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Drivers request certifications from their screen. Approve to unlock Fort Benning or wheelchair rides.
        Wheelchair rides also need the driver to be in a car marked as a van under Fleet.
      </p>
      {requests.length === 0 && <p className="text-slate-500">No pending requests.</p>}
      {requests.map((r) => (
        <CertRequestCard key={r.id} req={r} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Fleet

function FleetTab() {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({ carNumber: "", plate: "", isVan: false });
  const [error, setError] = useState("");

  useEffect(
    () =>
      onSnapshot(collection(db, "vehicles"), (snap) =>
        setVehicles(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.carNumber).localeCompare(String(b.carNumber), undefined, { numeric: true }))
        )
      ),
    []
  );

  async function addVehicle(e) {
    e.preventDefault();
    setError("");
    const car = form.carNumber.trim();
    if (!/^[A-Za-z0-9-]{1,6}$/.test(car)) {
      setError("Car number must be 1-6 letters/numbers.");
      return;
    }
    await setDoc(doc(db, "vehicles", car), {
      carNumber: car,
      plate: form.plate.trim().toUpperCase(),
      isVan: form.isVan,
      active: true,
    });
    setForm({ carNumber: "", plate: "", isVan: false });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addVehicle} className="bg-white rounded-xl p-4 border border-slate-200 flex flex-wrap gap-2 items-end">
        <label className="text-sm text-slate-600">
          Car #
          <input
            value={form.carNumber}
            onChange={(e) => setForm({ ...form, carNumber: e.target.value })}
            className="block w-20 mt-1 border-2 border-slate-300 rounded-lg px-2 py-2 font-bold"
          />
        </label>
        <label className="text-sm text-slate-600">
          Plate
          <input
            value={form.plate}
            onChange={(e) => setForm({ ...form, plate: e.target.value })}
            className="block w-28 mt-1 border-2 border-slate-300 rounded-lg px-2 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 pb-2">
          <input type="checkbox" checked={form.isVan} onChange={(e) => setForm({ ...form, isVan: e.target.checked })} />
          &#9855; Wheelchair van
        </label>
        <button className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold">Add / Update</button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>

      <div className="space-y-2">
        {vehicles.map((v) => (
          <div key={v.id} className="bg-white rounded-xl px-4 py-3 border border-slate-200 flex items-center justify-between gap-3">
            <p className="font-bold text-slate-900">
              Car {v.carNumber}{" "}
              <span className="font-normal text-slate-500">{v.plate}</span>
              {v.isVan && <span className="ml-2 text-sm font-bold text-blue-700">&#9855; Van</span>}
            </p>
            <button
              onClick={() => updateDoc(doc(db, "vehicles", v.id), { isVan: !v.isVan })}
              className="text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              {v.isVan ? "Not a van" : "Mark as van"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DriversAdmin() {
  const { logout } = useAuth();
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-950 text-white px-6 py-5 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link to="/admin/dashboard" className="text-slate-300 hover:text-white font-semibold">
            &larr; Dispatch
          </Link>
          <h1 className="font-display font-bold text-2xl">Drivers &amp; Fleet</h1>
        </div>
        <button onClick={logout} className="text-base text-slate-300 hover:text-white">
          Log Out
        </button>
      </header>
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex gap-2 mb-5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full font-bold ${tab === t ? "bg-navy-950 text-white" : "bg-white text-slate-600"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "Drivers" && <DriversTab />}
        {tab === "Certifications" && <CertificationsTab />}
        {tab === "Fleet" && <FleetTab />}
        {tab === "Payouts" && <PayoutsTab />}
      </div>
    </div>
  );
}
