import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL } from "../config/constants";

const startMaskedCall = httpsCallable(functions, "startMaskedCall");

/**
 * Private call between rider and driver. The company's number rings the
 * caller's phone, plays the recording notice, then connects the other
 * person; nobody sees a real number. Until the calling keys are in, the
 * rider gets the office number and the driver can dial direct.
 */
export default function CallButton({ rideId, label, fallbackTel, dark = false, className = "" }) {
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);

  async function call() {
    setBusy(true);
    try {
      const { data } = await startMaskedCall({ rideId });
      setSheet(data);
    } catch (e) {
      setSheet({ error: e?.message || "The call didn't go through." });
    } finally {
      setBusy(false);
    }
  }

  const btn = dark
    ? "bg-white/10 text-white border-2 border-white/25"
    : "bg-white text-blue-700 border-2 border-blue-300";
  return (
    <>
      <button type="button" onClick={call} disabled={busy} className={`w-full min-h-[52px] rounded-xl font-bold text-base ${btn} ${className}`}>
        {"\u{1F4DE}"} {busy ? "Connecting…" : label}
      </button>
      {sheet && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Call">
          <div className="w-full max-w-sm rounded-3xl bg-white text-slate-800 p-6 text-center space-y-3">
            <p className="text-4xl" aria-hidden="true">
              {"\u{1F4DE}"}
            </p>
            {sheet.error ? (
              <>
                <p className="text-lg font-bold">{sheet.error}</p>
                <a href={`tel:${COMPANY_PHONE_TEL}`} className="block rounded-xl bg-blue-600 text-white font-bold py-3">
                  Call the office {COMPANY_PHONE_DISPLAY}
                </a>
              </>
            ) : sheet.mode === "live" ? (
              <>
                <p className="text-xl font-bold">Your phone is ringing now</p>
                <p className="text-slate-600">Answer it to be connected to {sheet.otherLabel}. The call may be recorded for quality and safety.</p>
              </>
            ) : sheet.mode === "demo" ? (
              <>
                <p className="text-xl font-bold">Calling {sheet.otherLabel}&hellip;</p>
                <p className="text-sm text-slate-600">
                  Demo: in the real app your phone rings from the company number and connects you. Nobody sees a real number, and calls may be
                  recorded for quality and safety.
                </p>
              </>
            ) : fallbackTel ? (
              <>
                <p className="text-lg font-bold">Private calling isn&rsquo;t set up yet</p>
                <a href={`tel:${fallbackTel}`} className="block rounded-xl bg-emerald-600 text-white font-bold py-3">
                  Call directly (shows your number)
                </a>
              </>
            ) : (
              <>
                <p className="text-lg font-bold">Call the office and we&rsquo;ll reach your driver</p>
                <a href={`tel:${COMPANY_PHONE_TEL}`} className="block rounded-xl bg-blue-600 text-white font-bold py-3">
                  {COMPANY_PHONE_DISPLAY}
                </a>
              </>
            )}
            <button type="button" onClick={() => setSheet(null)} className="w-full min-h-[48px] rounded-xl border-2 border-slate-300 font-bold">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
