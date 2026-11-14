import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import LegalConsent from "../legal/LegalConsent";

const accept = httpsCallable(functions, "acceptDriverAgreement");
const DOCS = ["driver-agreement", "privacy"];

/** Shown before the driver screen until the current agreement is accepted. */
export default function DriverAgreementGate({ driver, onSignOut }) {
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      await accept({ version: record.version, docs: record.docs, marketingOptIn: record.marketingOptIn });
    } catch (e) {
      setMsg(e?.message || "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 text-white px-5 py-10">
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <p className="text-xs font-bold tracking-[0.3em] text-gold-400 uppercase">Car {driver.carNumber}</p>
          <h1 className="font-display text-3xl font-semibold mt-1">Before you drive</h1>
          <p className="text-slate-300 mt-2">
            Read and accept the Driver Agreement and Privacy Policy. {driver.agreement ? "They have changed since you last agreed." : "You only do this once per version."}
          </p>
        </div>
        <LegalConsent docIds={DOCS} onChange={setRecord} dark promoLabel="Send me company offers and news by text and email." />
        {msg && <p className="text-red-300">{msg}</p>}
        <button disabled={!record || busy} onClick={submit} className="w-full rounded-2xl py-4 text-lg font-bold bg-gold-400 text-navy-950 disabled:opacity-40">
          {busy ? "Saving…" : "Agree and continue"}
        </button>
        <button onClick={onSignOut} className="w-full py-2 text-slate-400 font-semibold">
          Sign out
        </button>
      </div>
    </div>
  );
}
