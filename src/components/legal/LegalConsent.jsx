import { useEffect, useRef, useState } from "react";
import { DOCUMENTS, consentRecord } from "../../legal/documents";
import LegalText from "./LegalText";

const names = (docIds) => docIds.map((d) => DOCUMENTS[d].title).join(" and ");

/**
 * "Open it, scroll to the bottom, then check the box."
 * The agree box stays locked until the documents have been opened and
 * scrolled to the end. Promotions are a separate, optional box.
 * onChange(record | null): record = { docs, version, acceptedAt, marketingOptIn }.
 */
export default function LegalConsent({ docIds, onChange, promoLabel, dark = false }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [promo, setPromo] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    onChange?.(agreed ? consentRecord(docIds, promo) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreed, promo]);

  function checkEnd() {
    const el = scroller.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setAtEnd(true);
  }
  useEffect(() => {
    if (open) {
      setAtEnd(false);
      setTimeout(checkEnd, 50);
    }
  }, [open]);

  const text = dark ? "text-slate-200" : "text-slate-700";
  const sub = dark ? "text-slate-500" : "text-slate-500";
  const panel = dark ? "border-white/15 bg-white/[0.04]" : "border-slate-300 bg-slate-50";

  return (
    <div className={`rounded-2xl border-2 p-4 space-y-3 ${panel}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-xl py-3 font-bold border-2 ${read ? "border-emerald-500 text-emerald-600" : "border-gold-400 text-navy-950 bg-gold-300"}`}
      >
        {read ? `✓ Read — open the ${names(docIds)} again` : `Open and read the ${names(docIds)}`}
      </button>

      <label className={`flex items-start gap-3 ${text} ${read ? "" : "opacity-60"}`} onClick={() => !read && setOpen(true)}>
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={!read} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I have read and agree to the {names(docIds)}.
          {!read && <span className={`block text-sm ${sub}`}>Open it and scroll to the bottom to unlock this box.</span>}
        </span>
      </label>

      <label className={`flex items-start gap-3 ${text}`}>
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={promo} onChange={(e) => setPromo(e.target.checked)} />
        <span>
          {promoLabel || "Send me deals and news by text and email."} <span className={`text-sm ${sub}`}>Optional. Message and data rates may apply. Reply STOP to quit.</span>
        </span>
      </label>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl h-[92vh] sm:h-[85vh] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center">
              <p className="font-bold text-slate-900 flex-1">{names(docIds)}</p>
              <button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-slate-500 px-2" aria-label="Close">
                &times;
              </button>
            </div>
            <div ref={scroller} onScroll={checkEnd} className="flex-1 overflow-y-auto px-5 py-4" data-testid="legal-scroll">
              <LegalText docIds={docIds} />
              <p className="text-center text-sm text-slate-500 py-4">&mdash; End &mdash;</p>
            </div>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                disabled={!atEnd}
                onClick={() => {
                  setRead(true);
                  setOpen(false);
                }}
                className="w-full rounded-xl py-3.5 font-bold bg-navy-950 text-white disabled:bg-slate-200 disabled:text-slate-500"
              >
                {atEnd ? "I've read it — continue" : "Scroll to the bottom to continue ↓"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
