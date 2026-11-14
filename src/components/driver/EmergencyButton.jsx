import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL } from "../../config/constants";
import { quickFix } from "../../utils/quickFix";

const driverEmergency = httpsCallable(functions, "driverEmergency");

/** Red SOS button, always on the driver screen: 911, alert the office, or call the office. */
export default function EmergencyButton() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState("");

  async function alertOffice(called911) {
    const fix = await quickFix(called911 ? 1500 : 4000);
    try {
      await driverEmergency({ ...(fix || {}), called911 });
      setSent("The office has been alerted with your location.");
    } catch {
      setSent(`Couldn't reach the office. Call ${COMPANY_PHONE_DISPLAY}.`);
    }
  }

  function call911() {
    alertOffice(true);
    // Give the alert a moment to leave, then dial.
    setTimeout(() => {
      window.location.href = "tel:911";
    }, 400);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSent("");
          setOpen(true);
        }}
        aria-label="Emergency: call 911"
        className="fixed bottom-5 left-4 z-50 flex items-center gap-2 rounded-full bg-red-600 px-5 min-h-[56px] text-white font-extrabold text-lg shadow-2xl ring-4 ring-red-600/30"
      >
        <span aria-hidden="true">&#128680;</span> SOS
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] bg-black/75 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Emergency">
          <div className="w-full max-w-md rounded-3xl bg-navy-900 border-2 border-red-500 p-5 space-y-3 text-white">
            <p className="text-2xl font-display font-bold text-red-300">Emergency</p>
            <a
              href="tel:911"
              onClick={(e) => {
                e.preventDefault();
                call911();
              }}
              className="flex items-center justify-center gap-3 w-full min-h-[72px] rounded-2xl bg-red-600 text-white font-extrabold text-3xl"
            >
              &#9742; Call 911
            </a>
            <p className="text-sm text-slate-300 text-center">Calling 911 here also alerts the office with your location.</p>
            <button type="button" onClick={() => alertOffice(false)} className="w-full min-h-[56px] rounded-2xl border-2 border-red-400 text-red-200 font-bold text-lg">
              Alert the office only
            </button>
            <a href={`tel:${COMPANY_PHONE_TEL}`} className="flex items-center justify-center w-full min-h-[56px] rounded-2xl border-2 border-white/30 font-bold text-lg">
              Call the office {COMPANY_PHONE_DISPLAY}
            </a>
            {sent && <p className="rounded-xl bg-white/10 p-3 text-center font-semibold">{sent}</p>}
            <button type="button" onClick={() => setOpen(false)} className="w-full py-3 text-slate-300 font-semibold">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
