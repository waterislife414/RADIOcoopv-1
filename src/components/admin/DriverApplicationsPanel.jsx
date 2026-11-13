import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { formatPhoneDisplay } from "../../utils/phone";

function ApplicationCard({ app }) {
  const [carNumber, setCarNumber] = useState(app.existingCarNumber || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    if (!carNumber.trim()) {
      setError("Enter the car number first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await httpsCallable(functions, "approveDriver")({ uid: app.id, carNumber: carNumber.trim() });
    } catch (err) {
      setError(err.message || "Could not approve.");
      setBusy(false);
    }
  }

  async function reject() {
    const reason = window.prompt("Reason (the applicant will see this):", "") ?? null;
    if (reason === null) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "rejectDriver")({ uid: app.id, reason });
    } catch (err) {
      setError(err.message || "Could not reject.");
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 space-y-3">
      <div>
        <p className="font-bold text-lg text-slate-800">{app.fullName}</p>
        <p className="text-sm text-slate-500">
          {formatPhoneDisplay(app.phone)} &middot; {app.email}
        </p>
        {app.existingDriver && (
          <p className="text-sm font-semibold text-blue-700 mt-1">
            Already drives here{app.existingCarNumber ? ` — Car ${app.existingCarNumber}` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        {app.dlImageUrl && (
          <a href={app.dlImageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            License
          </a>
        )}
        {app.mvrDocumentUrl && (
          <a href={app.mvrDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            MVR
          </a>
        )}
        {app.resumeUrl && (
          <a href={app.resumeUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            Resume
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Car #"
          value={carNumber}
          onChange={(e) => setCarNumber(e.target.value)}
          className="w-24 border-2 border-slate-300 rounded-xl px-3 py-2.5 text-base font-bold"
        />
        <button
          onClick={approve}
          disabled={busy}
          className="flex-1 bg-emerald-600 text-white font-bold rounded-xl disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={reject}
          disabled={busy}
          className="px-4 bg-red-50 text-red-700 font-bold rounded-xl disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function DriverApplicationsPanel() {
  const [apps, setApps] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, "driver_applications"),
      where("status", "==", "pending"),
      orderBy("timestamp", "desc")
    );
    return onSnapshot(
      q,
      (snap) => setApps(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setApps([])
    );
  }, []);

  if (apps.length === 0) return null;

  return (
    <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-5">
      <h2 className="font-bold text-lg text-blue-900 mb-3">Driver Applications ({apps.length})</h2>
      <div className="space-y-3">
        {apps.map((app) => (
          <ApplicationCard key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}
