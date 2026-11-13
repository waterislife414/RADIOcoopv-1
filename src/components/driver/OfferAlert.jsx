import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { BRAND } from "../../config/constants";
import { ring } from "../../utils/alertSound";

const OFFER = { pings: 3, pingIntervalSec: 15, ...(BRAND.dispatch?.offer || {}) };
const MAX_WARNINGS = BRAND.dispatch?.maxWarnings ?? 3;
const accept = httpsCallable(functions, "acceptOffer");
const decline = httpsCallable(functions, "declineOffer");

/** Full-screen incoming call. Rings on each of the 3 pings. */
export default function OfferAlert({ offer, warnings = 0 }) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const ping = Math.min(OFFER.pings, Math.max(1, Math.floor((now - offer.startedAt) / (OFFER.pingIntervalSec * 1000)) + 1));
  useEffect(() => {
    ring(3);
  }, [ping, offer.rideId]);

  const left = Math.max(0, Math.ceil((offer.expiresAt - now) / 1000));
  const requested = offer.kind === "requested";

  async function answer(fn) {
    setBusy(true);
    setMsg("");
    try {
      await fn({ rideId: offer.rideId });
    } catch (e) {
      setMsg(e?.message || "Couldn't reach dispatch. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950 text-white flex flex-col px-6 pt-10 pb-8">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col">
        <p className="text-amber-300 font-bold tracking-[0.3em] uppercase text-sm animate-pulse">
          {"\u{1F4DE}"} Incoming call
        </p>
        <p className="text-slate-400 mt-1">
          Ping {ping} of {OFFER.pings} &middot; {left}s
        </p>

        {requested && (
          <p className="mt-4 inline-block self-start rounded-full bg-gold-400 text-navy-950 font-bold px-3 py-1">
            Rider requested you
          </p>
        )}
        <h2 className="font-display font-bold text-4xl mt-4">{offer.zoneLabel || "Call"}</h2>
        <p className="text-2xl mt-3 leading-snug">{offer.pickup}</p>
        {offer.dropoff && (
          <p className="text-lg text-slate-300 mt-2">
            &rarr; {offer.dropoff}
            {offer.dropZoneLabel ? ` (${offer.dropZoneLabel})` : ""}
          </p>
        )}
        {offer.notes && <p className="mt-3 text-amber-200">{"\u{1F4DD}"} {offer.notes}</p>}
        <div className="flex flex-wrap gap-2 mt-4 text-sm">
          {offer.wheelchair && <span className="rounded-full bg-sky-500/20 text-sky-200 px-3 py-1">{"♿"} Wheelchair</span>}
          {offer.passengers > 1 && <span className="rounded-full bg-white/10 px-3 py-1">{offer.passengers} riders</span>}
          {offer.paymentMethod && <span className="rounded-full bg-white/10 px-3 py-1 capitalize">{offer.paymentMethod}</span>}
        </div>

        <div className="mt-auto space-y-3 pt-8">
          {msg && <p className="text-red-300">{msg}</p>}
          {!confirming ? (
            <>
              <button
                disabled={busy}
                onClick={() => answer(accept)}
                className="w-full rounded-2xl py-6 text-2xl font-bold bg-emerald-500 hover:bg-emerald-400 text-navy-950 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                disabled={busy}
                onClick={() => (requested ? answer(decline) : setConfirming(true))}
                className="w-full rounded-2xl py-4 text-lg font-bold bg-white/10 hover:bg-white/15 disabled:opacity-50"
              >
                Decline
              </button>
            </>
          ) : (
            <div className="rounded-2xl border-2 border-red-500 p-4 space-y-3">
              <p>
                Declining takes you off the board and gives you warning {warnings + 1} of {MAX_WARNINGS}.
                {warnings + 1 >= MAX_WARNINGS ? " That means coming back to the shop." : ""}
              </p>
              <div className="flex gap-3">
                <button
                  disabled={busy}
                  onClick={() => answer(decline)}
                  className="flex-1 rounded-xl py-3 font-bold bg-red-600 disabled:opacity-50"
                >
                  Decline anyway
                </button>
                <button onClick={() => setConfirming(false)} className="flex-1 rounded-xl py-3 font-bold bg-white/10">
                  Go back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
