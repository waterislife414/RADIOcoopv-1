import { useEffect, useRef, useState } from "react";
import { DOCUMENTS, consentRecord } from "../../legal/documents";
import { BRAND } from "../../config/constants";
import LegalText from "./LegalText";

const RR = { headsUpMinutes: 4, lateCancelFee: 5, waitGraceMinutes: 2, noShowFee: 10, ...(BRAND.rideRules || {}) };
const WAIT = Number(BRAND.pricing?.fare?.WAIT_TIME_PER_MINUTE) || 0.35;
const usd = (n) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

/**
 * Riders (owner decision Nov 23, 2026: one tap, plain words): the few rules that cost money,
 * links to the full documents, one required box and one optional deals box. No scrolling gate.
 */
function QuickConsent({ docIds, onAccept, onClose, confirmLabel, busy, title }) {
  const [agree, setAgree] = useState(false);
  const [promo, setPromo] = useState(false);
  const [read, setRead] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={names(docIds)}>
      <div className="bg-white w-full sm:max-w-lg max-h-[94vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl" data-testid="consent-quick">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 bg-navy-950 text-white">
          <p className="flex-1 font-bold text-lg">{title}</p>
          <button type="button" onClick={onClose} className="text-3xl leading-none text-slate-300 px-1" aria-label="Close">
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" data-testid="legal-scroll">
          <ul className="space-y-1.5 text-base text-slate-800" data-testid="consent-summary">
            <li>Free to cancel until your driver is about {RR.headsUpMinutes} minutes away. After that: {usd(RR.lateCancelFee)}.</li>
            <li>Not there after your driver arrives and waits: no-show fee up to {usd(RR.noShowFee)}.</li>
            <li>
              First {RR.waitGraceMinutes} minutes of waiting are free, then {usd(WAIT)} a minute.
            </li>
            <li>The meter sets the fare. Same price cash or card.</li>
          </ul>
          <button type="button" onClick={() => setRead(!read)} className="text-sm font-semibold text-blue-700 underline">
            {read ? "Hide" : "Read"} the full {names(docIds)}
          </button>
          {read && (
            <div className="border border-slate-200 rounded-xl p-3 max-h-[40vh] overflow-y-auto">
              <LegalText docIds={docIds} />
            </div>
          )}
          <label className={`flex items-start gap-3 rounded-xl border-2 p-3.5 ${agree ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-white"}`}>
            <input type="checkbox" data-testid="consent-agree" className="mt-0.5 h-6 w-6 shrink-0 accent-emerald-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="text-slate-800">
              I agree to the {names(docIds)}, and to calls, texts and emails about my rides.
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border-2 border-slate-200 p-3.5">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" checked={promo} onChange={(e) => setPromo(e.target.checked)} />
            <span className="text-slate-700 text-sm">
              Text and email me deals (optional). Message and data rates may apply. Reply STOP any time.
            </span>
          </label>
        </div>
        <div className="p-4 border-t border-slate-200 bg-white">
          <button
            type="button"
            disabled={!agree || busy}
            onClick={() => onAccept({ ...consentRecord(docIds, promo), contactOptIn: true })}
            className="w-full rounded-2xl py-4 text-lg font-bold bg-navy-950 text-white disabled:bg-slate-200 disabled:text-slate-500"
          >
            {busy ? "Working\u2026" : agree ? confirmLabel : "Check the box to continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  quick = false,
  title = "Before you book",
}) {
  if (quick && open) return <QuickConsent docIds={docIds} onAccept={onAccept} onClose={onClose} confirmLabel={confirmLabel} busy={busy} title={title} />;
  return <FullConsent {...{ docIds, open, onAccept, onClose, confirmLabel, contactLabel, promoLabel, busy }} />;
}

function FullConsent({ docIds, open, onAccept, onClose, confirmLabel, contactLabel, promoLabel, busy }) {
  const [atEnd, setAtEnd] = useState(false);
  const [terms, setTerms] = useState(false);
  const [contact, setContact] = useState(true);
  const [promo, setPromo] = useState(true);
  const scroller = useRef(null);

  useEffect(() => {
    if (!open) return;
    setAtEnd(false);
    setTerms(false);
    setContact(true);
    setPromo(true);
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
