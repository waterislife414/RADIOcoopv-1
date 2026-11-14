import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { formatPhoneDisplay, normalizePhone } from "../../utils/phone";

const createRide = httpsCallable(functions, "dispatcherCreateRide");
const forgetCaller = httpsCallable(functions, "forgetCaller");
const EMPTY = { phone: "", firstName: "", lastName: "", pickup: "", dropoff: "", zoneId: "", passengers: 1, wheelchair: false, requestedDriverId: "", later: false, scheduledFor: "", notes: "", remember: true };

/** Phone call → ride in a few keystrokes. Saved callers fill in name and places. */
export default function QuickEntry({ zones, board }) {
  const [f, setF] = useState(EMPTY);
  const [caller, setCaller] = useState(null); // { saved, recent, blocked }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const phoneRef = useRef(null);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const digits = normalizePhone(f.phone);

  useEffect(() => {
    if (digits.length !== 10) {
      setCaller(null);
      return undefined;
    }
    let live = true;
    (async () => {
      const [saved, blocked, recent] = await Promise.all([
        getDoc(doc(db, "phoneRiders", digits)),
        getDoc(doc(db, "blacklist_phones", digits)),
        getDocs(query(collection(db, "rides"), where("phone", "==", digits), orderBy("timestamp", "desc"), limit(5))).catch(() => null),
      ]);
      if (!live) return;
      const s = saved.data() || null;
      const rides = recent ? recent.docs.map((d) => d.data()) : [];
      setCaller({ saved: s, blocked: blocked.exists(), rides });
      const last = rides[0];
      setF((x) => ({
        ...x,
        firstName: x.firstName || s?.firstName || last?.firstName || "",
        lastName: x.lastName || s?.lastName || last?.lastName || "",
      }));
    })();
    return () => {
      live = false;
    };
  }, [digits]);

  const places = (() => {
    const seen = new Set();
    const out = [];
    for (const t of [
      ...(caller?.saved?.places || []).map((p) => p.text),
      ...(caller?.rides || []).flatMap((r) => [r.pickup, r.dropoff]),
    ]) {
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        out.push(t);
      }
    }
    return out.slice(0, 8);
  })();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await createRide({
        phone: digits,
        firstName: f.firstName,
        lastName: f.lastName,
        pickup: f.pickup,
        dropoff: f.dropoff,
        zoneId: f.zoneId || null,
        passengers: f.passengers,
        wheelchair: f.wheelchair,
        requestedDriverId: f.requestedDriverId || null,
        scheduleType: f.later ? "later" : "now",
        scheduledFor: f.later ? f.scheduledFor : null,
        notes: f.notes,
        remember: f.remember,
      });
      setMsg({ ok: true, text: `Posted: ${f.pickup}` });
      setF(EMPTY);
      setCaller(null);
      phoneRef.current?.focus();
    } catch (err) {
      setMsg({ ok: false, text: err?.message || "Couldn't post the ride." });
    } finally {
      setBusy(false);
    }
  }

  const cars = [...board].sort((a, b) => String(a.carNumber).localeCompare(String(b.carNumber), undefined, { numeric: true }));
  const input = "w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base";

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border-2 border-navy-950/10 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="font-bold text-xl text-slate-700">{"\u{1F4DE}"} Phone call</h2>
        {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        <input ref={phoneRef} autoFocus value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Caller's number" inputMode="tel" className={input} />
        <input value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} placeholder="First name" className={input} />
        <input value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} placeholder="Last name" className={input} />
      </div>

      {caller && (
        <div className="text-sm flex flex-wrap items-center gap-2">
          {caller.blocked ? (
            <span className="font-bold text-red-700">{"⛔"} {formatPhoneDisplay(digits)} is blocked from booking.</span>
          ) : caller.saved || caller.rides.length ? (
            <>
              <span className="text-slate-600">
                Known caller{caller.saved?.rideCount ? ` · ${caller.saved.rideCount} rides` : ""}:
              </span>
              {caller.saved && (
                <button
                  type="button"
                  onClick={async () => {
                    await forgetCaller({ phone: digits });
                    setCaller((c) => ({ ...c, saved: null }));
                  }}
                  className="text-xs text-slate-500 underline"
                >
                  forget
                </button>
              )}
            </>
          ) : (
            <span className="text-slate-500">New caller.</span>
          )}
        </div>
      )}

      {places.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {places.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => (f.pickup ? set({ dropoff: p }) : set({ pickup: p }))}
              className="text-sm px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200"
              title={f.pickup ? "Use as drop-off" : "Use as pickup"}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        <input value={f.pickup} onChange={(e) => set({ pickup: e.target.value })} placeholder="Pickup address or place" className={input} />
        <input value={f.dropoff} onChange={(e) => set({ dropoff: e.target.value })} placeholder="Drop-off (optional)" className={input} />
      </div>

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <select value={f.zoneId} onChange={(e) => set({ zoneId: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2">
          <option value="">Zone: find it</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
        <select value={f.passengers} onChange={(e) => set({ passengers: Number(e.target.value) })} className="border border-slate-300 rounded-lg px-2 py-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} rider{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <select value={f.requestedDriverId} onChange={(e) => set({ requestedDriverId: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-2">
          <option value="">Any car</option>
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              Asked for car {c.carNumber}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.wheelchair} onChange={(e) => set({ wheelchair: e.target.checked })} />
          {"♿"} Wheelchair
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.later} onChange={(e) => set({ later: e.target.checked })} />
          Later
        </label>
        {f.later && (
          <input type="datetime-local" value={f.scheduledFor} onChange={(e) => set({ scheduledFor: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5" />
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Note for the driver (optional)" className={`${input} flex-1 min-w-48`} />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={f.remember} onChange={(e) => set({ remember: e.target.checked })} />
          Remember caller
        </label>
        <button
          disabled={busy || digits.length !== 10 || !f.pickup || caller?.blocked}
          className="rounded-xl px-6 py-3 font-bold bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 disabled:opacity-40"
        >
          {busy ? "Posting…" : "Post ride"}
        </button>
      </div>
    </form>
  );
}
