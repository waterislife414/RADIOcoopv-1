import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { compressImage } from "../../utils/compressImage";
import {
  PHOTO_SLOTS, FLUIDS, FLUID_ANSWERS, CHECKS, DAMAGE_AREAS, REPAIR_ITEMS, URGENCY, TYPES, MIN_INITIAL_PHOTOS,
  validateInspection,
} from "../../../functions/lib/inspectionCore.mjs";

const submitInspection = httpsCallable(functions, "submitInspection");
const BTN = "min-h-[52px] rounded-2xl font-bold text-lg px-4";
const CARD = "rounded-2xl bg-white/[0.06] border border-white/15 p-4";

const ATTEST = {
  initial:
    "I walked all the way around this car and inside it. These photos and answers are true. Damage I marked as already there was there before I took the car. From now on I take full responsibility for this vehicle while it is leased to me, including its upkeep and any damage I cause.",
  weekly:
    "I inspected this car today. These photos and answers are true. I take full responsibility for this vehicle while it is leased to me, including its upkeep and any damage I cause.",
  damage: "These photos and answers about the damage are true.",
  repair: "This description of the problem is true to the best of my knowledge.",
};

/** One photo slot: tap to open the camera. Shows a preview once taken. */
function PhotoSlot({ label, hint, required, file, onFile }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <label className={`relative block rounded-2xl border-2 overflow-hidden cursor-pointer ${file ? "border-emerald-400" : required ? "border-gold-400/70" : "border-white/20"}`}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files[0] || null;
          if (f) {
            const compressed = await compressImage(f);
            onFile(compressed);
          } else {
            onFile(null);
          }
        }}
      />
      {preview ? (
        <img src={preview} alt={label} className="w-full h-28 object-cover" />
      ) : (
        <div className="h-28 flex flex-col items-center justify-center text-center px-2 bg-white/[0.04]">
          <span className="text-3xl" aria-hidden="true">&#128247;</span>
          <span className="text-xs text-slate-300 mt-1">{hint}</span>
        </div>
      )}
      <span className={`block text-center text-sm font-bold py-1.5 ${file ? "bg-emerald-500 text-navy-950" : "bg-white/10 text-white"}`}>
        {file ? "✓ " : ""}
        {label}
        {!required && !file ? " (optional)" : ""}
      </span>
    </label>
  );
}

function Choice({ options, value, onChange, tone = {} }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Object.keys(options).length}, minmax(0, 1fr))` }}>
      {Object.entries(options).map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`min-h-[48px] rounded-xl border-2 text-sm font-bold px-2 leading-tight ${value === k ? tone[k] || "border-gold-400 bg-gold-400 text-navy-950" : "border-white/20 text-slate-200"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function VehicleInspection() {
  const [params] = useSearchParams();
  const type = TYPES[params.get("type")] ? params.get("type") : "weekly";
  const then = params.get("then");
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [driver, setDriver] = useState(null);
  const full = type === "initial" || type === "weekly";

  const [photos, setPhotos] = useState({});
  const [video, setVideo] = useState(null);
  const [hasDamage, setHasDamage] = useState(type === "damage" ? "yes" : null);
  const [damages, setDamages] = useState(type === "damage" ? [{ area: "", description: "", file: null, preExisting: false }] : []);
  const [fluids, setFluids] = useState({});
  const [checks, setChecks] = useState({});
  const [checkNotes, setCheckNotes] = useState({});
  const [repairs, setRepairs] = useState(type === "repair" ? [{ item: "", description: "", urgency: "soon", file: null }] : []);
  const [mileage, setMileage] = useState("");
  const [signedName, setSignedName] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(doc(db, "drivers", currentUser.uid), (s) => setDriver(s.data() || null));
  }, [currentUser]);

  const slots = PHOTO_SLOTS.filter((s) => type === "initial" || s.weekly);
  const steps = full
    ? ["photos", "damage", "fluids", "checks", "repairs", "sign"]
    : type === "damage"
      ? ["damage", "sign"]
      : ["repairs", "sign"];
  const current = steps[step];

  const photoCount = Object.values(photos).filter(Boolean).length;
  const photoProblem =
    type === "initial"
      ? PHOTO_SLOTS.some((s) => !s.optional && !photos[s.id]) || photoCount < MIN_INITIAL_PHOTOS
        ? `Take every photo marked in gold (${MIN_INITIAL_PHOTOS} or more).`
        : ""
      : slots.some((s) => !photos[s.id])
        ? "Take all five photos."
        : "";

  function stepProblem() {
    if (current === "photos") return photoProblem;
    if (current === "damage") {
      if (full && !hasDamage) return "Answer: does the car have any damage?";
      if (hasDamage === "yes" && !damages.length) return "Add the damage, or answer No.";
      if (damages.some((d) => !d.area || !d.file)) return "Pick where each damage is and take its photo.";
    }
    if (current === "fluids" && FLUIDS.some((f) => !fluids[f.id])) return "Answer every fluid.";
    if (current === "checks" && CHECKS.some((c) => !checks[c.id])) return "Answer every check.";
    if (current === "repairs" && repairs.some((r) => !r.item || !r.description.trim())) return "Pick what's wrong and describe it.";
    return "";
  }

  function next() {
    const p = stepProblem();
    setError(p);
    if (!p) {
      setStep((n) => n + 1);
      window.scrollTo(0, 0);
    }
  }

  async function upload(file, name) {
    const small = await compressImage(file);
    const path = `inspections/${currentUser.uid}/${Date.now()}_${name}.${small.type?.startsWith("video/") ? (file.name.split(".").pop() || "mp4") : "jpg"}`;
    await uploadBytes(ref(storage, path), small);
    return path;
  }

  async function submit() {
    setError("");
    const payload = {
      type,
      damageAnswered: hasDamage != null,
      fluids,
      checks,
      checkNotes,
      mileage,
      signedName,
      damages: damages.map((d) => ({ area: d.area, description: d.description, preExisting: d.preExisting, photo: d.file ? "pending/x.jpg" : null })),
      repairs: repairs.map((r) => ({ item: r.item, description: r.description, urgency: r.urgency, photo: null })),
      photos: Object.fromEntries(Object.entries(photos).filter(([, f]) => f).map(([k]) => [k, "pending/x.jpg"])),
    };
    const check = validateInspection(type, payload);
    if (check.error) return setError(check.error);

    setBusy(true);
    try {
      const files = [...Object.values(photos).filter(Boolean), ...damages.map((d) => d.file), ...repairs.map((r) => r.file).filter(Boolean), video].filter(Boolean);
      let n = 0;
      const tick = () => setProgress(`Uploading ${++n} of ${files.length}…`);
      
      for (const [k, f] of Object.entries(photos)) {
        if (f) {
          tick();
          payload.photos[k] = await upload(f, k);
        }
      }
      for (const [i, d] of damages.entries()) {
        if (d.file) {
          tick();
          payload.damages[i].photo = await upload(d.file, `damage${i}`);
        }
      }
      for (const [i, r] of repairs.entries()) {
        if (r.file) {
          tick();
          payload.repairs[i].photo = await upload(r.file, `problem${i}`);
        }
      }
      if (video) {
        tick();
        const path = `inspections/${currentUser.uid}/${Date.now()}_walkaround.${video.name.split(".").pop() || "mp4"}`;
        await uploadBytes(ref(storage, path), video);
        payload.video = path;
      }

      setProgress("Saving…");
      const { data } = await submitInspection(payload);
      setDone(data);
    } catch (e) {
      setError(e?.message || "Couldn't send it. Check your signal and try again.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  if (!currentUser) return null;

  if (done) {
    return (
      <div className="min-h-screen bg-navy-950 text-white px-5 py-10">
        <div className="max-w-md mx-auto text-center">
          <p className="text-6xl" aria-hidden="true">&#9989;</p>
          <h1 className="font-display text-3xl font-bold mt-3">{TYPES[type]} saved</h1>
          <p className="text-slate-300 mt-2 text-lg">
            {done.workOrders ? `${done.workOrders} repair${done.workOrders > 1 ? "s were" : " was"} sent to the shop.` : "Thank you."}
          </p>
          <button type="button" onClick={() => navigate(then === "online" ? "/driver?goOnline=1" : "/driver")} className={`${BTN} w-full mt-8 bg-gold-400 text-navy-950`}>
            {then === "online" ? "Done: back to the driver screen" : "Back to driver home"}
          </button>
        </div>
      </div>
    );
  }

  const damageCard = (d, i) => (
    <div key={i} className={CARD + " space-y-3"}>
      <label className="block">
        <span className="block font-bold mb-1">Where is it?</span>
        <select value={d.area} onChange={(e) => setDamages((l) => l.map((x, j) => (j === i ? { ...x, area: e.target.value } : x)))} className="w-full min-h-[48px] rounded-xl bg-white text-navy-950 px-3 text-base">
          <option value="">Pick a spot&hellip;</option>
          {DAMAGE_AREAS.map((a) => <option key={a}>{a}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block font-bold mb-1">What does it look like?</span>
        <input value={d.description} onChange={(e) => setDamages((l) => l.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="Dent, scratch, crack, stain, tear…" className="w-full min-h-[48px] rounded-xl bg-white text-navy-950 px-3 text-base" />
      </label>
      <PhotoSlot
        label="Photo of the damage"
        hint="Get close enough to see it"
        required
        file={d.file}
        onFile={(f) => setDamages((l) => l.map((x, j) => (j === i ? { ...x, file: f } : x)))}
      />
      <div>
        <p className="font-bold mb-2">Was it already there when you got this car?</p>
        <Choice
          options={{ yes: "Yes, it was already there", no: "No, it's new" }}
          value={d.preExisting ? "yes" : "no"}
          onChange={(v) => setDamages((l) => l.map((x, j) => (j === i ? { ...x, preExisting: v === "yes" } : x)))}
        />
      </div>
      <button type="button" onClick={() => setDamages((l) => l.filter((_, j) => j !== i))} className="text-sm font-bold text-red-300 underline">
        Remove this damage
      </button>
    </div>
  );

  const repairCard = (r, i) => (
    <div key={i} className={CARD + " space-y-3"}>
      <label className="block">
        <span className="block font-bold mb-1">What&rsquo;s wrong?</span>
        <select value={r.item} onChange={(e) => setRepairs((l) => l.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} className="w-full min-h-[48px] rounded-xl bg-white text-navy-950 px-3 text-base">
          <option value="">Pick one&hellip;</option>
          {REPAIR_ITEMS.map((a) => <option key={a}>{a}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block font-bold mb-1">Describe it for the mechanic</span>
        <textarea rows={3} value={r.description} onChange={(e) => setRepairs((l) => l.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="What you hear or feel, where, and when (e.g. grinding from front left when braking)" className="w-full rounded-xl bg-white text-navy-950 px-3 py-2 text-base" />
      </label>
      <div>
        <p className="font-bold mb-2">How soon?</p>
        <Choice options={URGENCY} value={r.urgency} onChange={(v) => setRepairs((l) => l.map((x, j) => (j === i ? { ...x, urgency: v } : x)))} tone={{ now: "border-red-400 bg-red-500 text-white" }} />
      </div>
      <PhotoSlot
        label="Photo (if it helps)"
        hint="Optional"
        file={r.file}
        onFile={(f) => setRepairs((l) => l.map((x, j) => (j === i ? { ...x, file: f } : x)))}
      />
      <button type="button" onClick={() => setRepairs((l) => l.filter((_, j) => j !== i))} className="text-sm font-bold text-red-300 underline">
        Remove
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-950 text-white px-4 pt-14 pb-32">
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <Link to="/driver" className="inline-flex items-center min-h-[48px] text-slate-300 font-semibold">&larr; Driver home</Link>
          <p className="text-xs font-bold tracking-widest text-gold-400 uppercase mt-4">
            Car {driver?.carNumber || "—"} &middot; Step {step + 1} of {steps.length}
          </p>
          <h1 className="font-display text-3xl font-bold">{TYPES[type]}</h1>
          <div className="h-2 rounded-full bg-white/10 mt-3 overflow-hidden">
            <div className="h-full bg-gold-400 transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
        </div>

        {current === "photos" && (
          <>
            <p className="text-lg text-slate-200">
              {type === "initial"
                ? "Walk all the way around the car. Take each photo marked in gold. These photos protect you: they show the car's condition before you drove it."
                : "Take these five photos of the car today."}
            </p>
            <p className="font-bold text-gold-300">{photoCount} photo{photoCount === 1 ? "" : "s"} taken</p>
            <div className="grid grid-cols-2 gap-3">
              {slots.map((s) => (
                <PhotoSlot
                  key={s.id}
                  label={s.label}
                  hint={s.hint}
                  required={!s.optional}
                  file={photos[s.id]}
                  onFile={(f) => setPhotos((p) => ({ ...p, [s.id]: f }))}
                />
              ))}
            </div>
            <div className={CARD}>
              <p className="font-bold">Walk-around video (optional)</p>
              <p className="text-sm text-slate-300 mt-1">About one minute, slowly all the way around. Uses roughly 40&ndash;100 MB of data, so Wi&#8209;Fi is best.</p>
              <label className={`${BTN} mt-3 flex items-center justify-center border-2 ${video ? "border-emerald-400 text-emerald-300" : "border-white/30"} cursor-pointer`}>
                <input type="file" accept="video/*" capture="environment" className="sr-only" onChange={(e) => setVideo(e.target.files[0] || null)} />
                {video ? `✓ Video added (${Math.round(video.size / 1048576)} MB)` : "\u{1F3A5} Record video"}
              </label>
            </div>
          </>
        )}

        {current === "damage" && (
          <>
            {full && (
              <div className={CARD}>
                <p className="text-lg font-bold mb-3">Does the car have any damage? (dents, scratches, cracks, stains, tears)</p>
                <Choice
                  options={{ no: "No damage", yes: "Yes" }}
                  value={hasDamage}
                  onChange={(v) => {
                    setHasDamage(v);
                    if (v === "yes" && !damages.length) setDamages([{ area: "", description: "", file: null, preExisting: type === "initial" }]);
                    if (v === "no") setDamages([]);
                  }}
                />
              </div>
            )}
            {type === "damage" && <p className="text-lg text-slate-200">Report it now, with a photo, before you keep driving.</p>}
            {damages.map(damageCard)}
            {(hasDamage === "yes" || type === "damage") && (
              <button type="button" onClick={() => setDamages((l) => [...l, { area: "", description: "", file: null, preExisting: type === "initial" }])} className={`${BTN} w-full border-2 border-white/30`}>
                + Add another damage
              </button>
            )}
          </>
        )}

        {current === "fluids" && (
          <>
            <p className="text-lg text-slate-200">Check each fluid with the engine off and the car on level ground.</p>
            {FLUIDS.map((f) => (
              <div key={f.id} className={CARD}>
                <p className="font-bold text-lg mb-2">{f.label}</p>
                <Choice options={FLUID_ANSWERS} value={fluids[f.id]} onChange={(v) => setFluids((x) => ({ ...x, [f.id]: v }))} tone={{ ok: "border-emerald-400 bg-emerald-500 text-navy-950", shop: "border-red-400 bg-red-500 text-white" }} />
              </div>
            ))}
          </>
        )}

        {current === "checks" && (
          <>
            <p className="text-lg text-slate-200">Anything marked Problem goes to the shop.</p>
            {CHECKS.map((c) => (
              <div key={c.id} className={CARD}>
                <p className="font-bold text-lg">{c.label}</p>
                {c.hint && <p className="text-sm text-slate-300 mb-2">{c.hint}</p>}
                <Choice options={{ ok: "OK", problem: "Problem" }} value={checks[c.id]} onChange={(v) => setChecks((x) => ({ ...x, [c.id]: v }))} tone={{ ok: "border-emerald-400 bg-emerald-500 text-navy-950", problem: "border-red-400 bg-red-500 text-white" }} />
                {checks[c.id] === "problem" && (
                  <input value={checkNotes[c.id] || ""} onChange={(e) => setCheckNotes((x) => ({ ...x, [c.id]: e.target.value }))} placeholder="What's wrong?" className="mt-2 w-full min-h-[48px] rounded-xl bg-white text-navy-950 px-3 text-base" />
                )}
              </div>
            ))}
          </>
        )}

        {current === "repairs" && (
          <>
            <p className="text-lg text-slate-200">
              {full
                ? "Anything else? Noises, rattles, shaking, pulling, leaks, brakes, lights, A/C. Add it here so the shop can order parts."
                : "Tell the shop what's wrong. They'll see it right away."}
            </p>
            {repairs.map(repairCard)}
            <button type="button" onClick={() => setRepairs((l) => [...l, { item: "", description: "", urgency: "soon", file: null }])} className={`${BTN} w-full border-2 border-white/30`}>
              + {repairs.length ? "Add another problem" : "Add a problem"}
            </button>
            {full && !repairs.length && <p className="text-center text-slate-400">Nothing else wrong? Tap Next.</p>}
          </>
        )}

        {current === "sign" && (
          <>
            {full && (
              <label className="block">
                <span className="block font-bold text-lg mb-1">Mileage (from the dashboard)</span>
                <input inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^\d]/g, ""))} className="w-full min-h-[52px] rounded-xl bg-white text-navy-950 px-3 text-xl font-mono" placeholder="84210" />
              </label>
            )}
            <div className={CARD}>
              <p className="font-bold text-gold-300 mb-2">Your sign-off</p>
              <p className="text-slate-200 leading-relaxed">{ATTEST[type] || ATTEST.weekly}</p>
            </div>
            <label className="block">
              <span className="block font-bold text-lg mb-1">Type your full name to sign</span>
              <input value={signedName} onChange={(e) => setSignedName(e.target.value)} autoComplete="name" className="w-full min-h-[52px] rounded-xl bg-white text-navy-950 px-3 text-lg" placeholder={driver?.name || "Full name"} />
            </label>
          </>
        )}

        {error && <p className="rounded-xl bg-red-500/20 border border-red-400/60 text-red-100 p-3">{error}</p>}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-navy-950/95 border-t border-white/10 p-4">
        <div className="max-w-md mx-auto grid grid-cols-[auto_1fr] gap-3">
          <button type="button" disabled={step === 0 || busy} onClick={() => setStep((n) => n - 1)} className={`${BTN} border-2 border-white/30 disabled:opacity-30`}>
            &larr; Back
          </button>
          {current === "sign" ? (
            <button type="button" disabled={busy} onClick={submit} className={`${BTN} bg-gold-400 text-navy-950 disabled:opacity-60`}>
              {busy ? progress || "Sending…" : "Sign & Send"}
            </button>
          ) : (
            <button type="button" onClick={next} className={`${BTN} bg-gold-400 text-navy-950`}>
              Next &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
