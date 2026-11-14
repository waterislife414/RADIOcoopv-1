import { useEffect, useRef, useState } from "react";
import { DOCUMENTS, consentRecord } from "../../legal/documents";
import LegalText from "./LegalText";

const names = (docIds) => docIds.map((d) => DOCUMENTS[d].title).join(" and ");

/**
 * Pop-up shown when someone is about to create an account, book, apply or
 * sign in as a driver. The documents scroll; the boxes sit at the very
 * bottom, so they have to scroll through to reach them. "Check all" ticks
 * every box. Promotions stay optional (the law doesn't allow making
 * marketing consent a condition of the service).
 *
 * onAccept(record): record = { docs, version, acceptedAt, contactOptIn, marketingOptIn }
 */
export default function ConsentModal({
  docIds,
  open,
  onAccept,
  onClose,
  confirmLabel = "Agree and continue",
  contactLabel = "I agree to be contacted by phone call, text message and email about my rides and my account.",
  promoLabel = "Yes, send me promotions, deals and special offers by text and email.",
  busy = false,
}) {
  const [atEnd, setAtEnd] = useState(false);
  const [terms, setTerms] = useState(false);
  const [contact, setContact] = useState(false);
  const [promo, setPromo] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    if (!open) return;
    setAtEnd(false);
    setTerms(false);
    setContact(false);
    setPromo(false);
    scroller.current?.scrollTo(0, 0);
  }, [open]);

  if (!open) return null;

  function checkEnd() {
    const el = scroller.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setAtEnd(true);
  }

  const all = terms && contact && promo;
  const setAll = (v) => {
    setTerms(v);
    setContact(v);
    setPromo(v);
  };
  const ready = atEnd && terms && contact;

  const box = (checked, onChange, label, note) => (
    <label className={`flex items-start gap-3 rounded-xl border-2 p-3.5 ${checked ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" checked={checked} disabled={!atEnd} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-slate-800">
        {label}
        {note && <span className="block text-xs text-slate-500 mt-0.5">{note}</span>}
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={names(docIds)}>
      <div className="bg-white w-full sm:max-w-2xl h-[94vh] sm:h-[88vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 bg-navy-950 text-white">
          <div className="flex-1">
            <p className="text-[11px] font-bold tracking-[0.25em] text-gold-400 uppercase">Before you continue</p>
            <p className="font-bold">{names(docIds)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-3xl leading-none text-slate-300 px-1" aria-label="Close">
            &times;
          </button>
        </div>

        <div ref={scroller} onScroll={checkEnd} className="flex-1 overflow-y-auto px-5 py-5" data-testid="legal-scroll">
          <LegalText docIds={docIds} />

          <div className="mt-8 pt-6 border-t-2 border-slate-200 space-y-3" data-testid="consent-boxes">
            <p className="text-center text-sm text-slate-500">{atEnd ? "Almost done — check the boxes below." : "Keep scrolling to the end."}</p>
            <button
              type="button"
              disabled={!atEnd}
              onClick={() => setAll(!all)}
              className={`w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-lg font-extrabold transition shadow-md disabled:opacity-40 ${
                all ? "bg-emerald-600 text-white" : "bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 animate-pulse-slow"
              }`}
            >
              <span className={`h-7 w-7 rounded-lg border-2 flex items-center justify-center text-xl ${all ? "border-white bg-white text-emerald-600" : "border-navy-950 bg-white/70"}`}>
                {all ? "✓" : ""}
              </span>
              Check all
            </button>
            {box(terms, setTerms, `I have read and agree to the ${names(docIds)}.`, "Required")}
            {box(contact, setContact, contactLabel, "Required")}
            {box(promo, setPromo, promoLabel, "Optional — message and data rates may apply. Reply STOP any time.")}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => onAccept({ ...consentRecord(docIds, promo), contactOptIn: contact })}
            className="w-full rounded-2xl py-4 text-lg font-bold bg-navy-950 text-white disabled:bg-slate-200 disabled:text-slate-500"
          >
            {busy ? "Working…" : !atEnd ? "Scroll to the bottom ↓" : !ready ? "Check the required boxes" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
