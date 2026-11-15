import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { BRAND } from "../config/constants";
import { lineText } from "../../functions/lib/rideTiming.mjs";
import { RIDE_RULES } from "../utils/rideLive";
import { useAuth } from "../context/AuthContext";

const queueStatus = httpsCallable(functions, "queueStatus");
const PASS = BRAND.copy.dayPass;

/**
 * "You're 3rd in line" while a ride waits for a driver. If they're not next
 * up and have no priority, the Priority Day Pass offer pops up right after
 * booking and once more a few minutes later.
 */
export default function LineStatus({ rideId, dark = false }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [q, setQ] = useState(null);
  const [offer, setOffer] = useState(false);
  const firstShown = useRef(null);
  const key = `rc-line-offer-${rideId}`;

  useEffect(() => {
    if (!rideId) return undefined;
    let stop = false;
    const load = () =>
      queueStatus({ rideId })
        .then(({ data }) => !stop && setQ(data))
        .catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [rideId]);

  useEffect(() => {
    if (!q?.waiting || q.hasPriority || q.position < 2) return undefined;
    let seen = {};
    try {
      seen = JSON.parse(sessionStorage.getItem(key) || "{}");
    } catch {
      seen = {};
    }
    const count = seen.count || 0;
    if (count >= 2) return undefined;
    const wait = count === 0 ? 0 : Math.max(0, (seen.at || 0) + RIDE_RULES.upsellAgainAfterMinutes * 60000 - Date.now());
    const t = setTimeout(() => {
      firstShown.current = Date.now();
      setOffer(true);
    }, wait);
    return () => clearTimeout(t);
  }, [q?.waiting, q?.hasPriority, q?.position, key]);

  function dismiss() {
    let seen = {};
    try {
      seen = JSON.parse(sessionStorage.getItem(key) || "{}");
    } catch {
      seen = {};
    }
    try {
      sessionStorage.setItem(key, JSON.stringify({ count: (seen.count || 0) + 1, at: Date.now() }));
    } catch {
      // Private mode: the offer may show again; harmless.
    }
    setOffer(false);
  }

  if (!q?.waiting) return null;
  const next = q.position <= 1;
  return (
    <>
      <div
        data-testid="line-status"
        className={`rounded-xl px-4 py-3 font-bold text-center ${
          dark ? "bg-white/10 text-gold-300" : next ? "bg-emerald-50 text-emerald-800 border-2 border-emerald-300" : "bg-amber-50 text-amber-900 border-2 border-amber-300"
        }`}
      >
        {next ? "You’re next up!" : `You’re ${lineText(q.position)}`}
        {q.premium && <span className="block text-xs font-semibold">Premium: members dispatch first</span>}
        {!next && !q.hasPriority && (
          <button type="button" onClick={() => setOffer(true)} className="block mx-auto mt-1 min-h-[44px] px-3 text-sm underline font-semibold">
            Skip ahead for {PASS.price}
          </button>
        )}
      </div>
      {offer && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={PASS.title}>
          <div className="w-full max-w-sm rounded-3xl bg-navy-950 text-white p-6 text-center space-y-3 shadow-luxury">
            <p className="text-sm font-bold text-slate-300">You&rsquo;re {lineText(q.position)}</p>
            <p className="text-xs font-bold tracking-[0.3em] text-gold-400 uppercase">{PASS.title}</p>
            <p className="font-display text-2xl font-bold">{PASS.tagline}</p>
            <ul className="text-left space-y-1.5 text-slate-200">
              {PASS.perks.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="text-gold-400" aria-hidden="true">
                    &#10003;
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <p className="font-mono text-4xl font-bold text-gold-300">{PASS.price}</p>
            <p className="text-xs text-slate-400">{PASS.fine}</p>
            {!currentUser && <p className="text-sm text-gold-200 font-semibold">As a guest: priority for this ride. Map and calling need a free account.</p>}
            <button
              type="button"
              onClick={() => navigate(`/fast-pass?ride=${encodeURIComponent(rideId)}`)}
              className="w-full min-h-[56px] rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-extrabold text-lg"
            >
              Skip ahead for {PASS.price}
            </button>
            <button type="button" onClick={dismiss} className="w-full min-h-[48px] rounded-2xl border-2 border-white/25 font-bold text-slate-200">
              No thanks, I&rsquo;ll wait
            </button>
          </div>
        </div>
      )}
    </>
  );
}
