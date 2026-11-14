import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../config/firebase";
import { CERT_LABELS } from "../../config/driverCerts";

const NOTES = {
  base: "Upload a photo of your base access pass.",
  wheelchair: "Only for drivers assigned a wheelchair van. Upload any training card or note from the office.",
};
const RENEW_WINDOW_MS = 14 * 24 * 3600 * 1000;

function CertRow({ certKey, driver }) {
  const cert = driver.certs?.[certKey];
  const [request, setRequest] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const info = CERT_LABELS[certKey];
  const requestId = `${driver.id}_${certKey}`;

  useEffect(
    () =>
      onSnapshot(
        doc(db, "certRequests", requestId),
        (snap) => setRequest(snap.exists() ? snap.data() : null),
        () => setRequest(null)
      ),
    [requestId]
  );

  async function submitProof(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fileRef = ref(storage, `driver_certs/${driver.id}/${certKey}_${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const proofUrl = await getDownloadURL(fileRef);
      await setDoc(doc(db, "certRequests", requestId), {
        uid: driver.id,
        cert: certKey,
        carNumber: driver.carNumber || "",
        name: driver.name || "",
        proofUrl,
        status: "pending",
        requestedAt: serverTimestamp(),
      });
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const approved = cert?.status === "approved" && (!cert.expiresAt || cert.expiresAt > Date.now());
  const expiringSoon = approved && cert.expiresAt && cert.expiresAt - Date.now() < RENEW_WINDOW_MS;
  const pending = request?.status === "pending";

  return (
    <div className="border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold text-lg">
          {info.icon} {info.label}
        </p>
        {approved && !expiringSoon && <span className="text-sm font-bold text-emerald-300">&#10003; Active</span>}
        {expiringSoon && <span className="text-sm font-bold text-amber-300">Expires {new Date(cert.expiresAt).toLocaleDateString()}</span>}
        {!approved && pending && <span className="text-sm font-bold text-blue-300">Pending review</span>}
      </div>
      {!approved && !pending && (
        <p className="text-slate-300 text-sm mt-1">Get certified to unlock {info.unlocks.toLowerCase()}.</p>
      )}
      {((!approved && !pending) || (expiringSoon && !pending)) && (
        <>
          <p className="text-slate-500 text-sm mt-1">{NOTES[certKey]}</p>
          <label className="mt-3 block text-center bg-white/10 hover:bg-white/15 rounded-xl py-3 font-bold cursor-pointer">
            {uploading ? "Uploading…" : expiringSoon ? "Upload renewal" : "Upload proof"}
            <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={submitProof} disabled={uploading} />
          </label>
        </>
      )}
      {request?.status === "denied" && !approved && !pending && (
        <p className="text-sm text-red-300 mt-2">Last request wasn't approved. Call the office.</p>
      )}
      {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
    </div>
  );
}

export default function DriverCerts({ driver }) {
  return (
    <section className="glass-panel border border-white/10 rounded-2xl p-5">
      <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-3">
        Certifications &middot; unlock more rides
      </p>
      <div className="space-y-3">
        {Object.keys(CERT_LABELS).map((key) => (
          <CertRow key={key} certKey={key} driver={driver} />
        ))}
      </div>
    </section>
  );
}
