'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarCheck, Camera, Car, CircleCheck, Clock, CreditCard, FileText, Info, KeyRound, LoaderCircle,
  MapPin, Phone, Tag, Trash, Truck, Upload, Warehouse,
} from 'lucide-react';
import { BUSINESS, publicShopAddress, telHref } from '@/config/business';
import { checkCoverage, findZip } from '@/config/serviceArea';
import { SERVICES, SERVICE_BY_ID } from '@/config/services';
import { BOOKING_WINDOWS } from '@/config/scheduling';
import { formatCents, formatCentsShort } from '@/lib/money';
import { formatDateISO } from '@/lib/time';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { readStoredUtm } from '@/components/layout/UtmCapture';
import type { AvailabilityResponse } from '@/app/api/availability/route';

// ---------------------------------------------------------------- types

type Mode = 'mobile' | 'shop';
type UploadItem = { id: string; name: string; status: 'uploading' | 'done' | 'error'; path?: string; error?: string };
type PromoState = { state: 'idle' | 'checking' | 'ok' | 'bad'; message: string };

type Draft = {
  mode: Mode | null;
  zip: string; street: string; city: string; state: 'AL' | 'GA'; parkingNotes: string; afterHoursKeyDrop: boolean;
  year: string; make: string; model: string; engine: string; vin: string; mileage: string;
  serviceIds: string[]; symptoms: string;
  date: string | null; windowId: string | null; promoCode: string;
  name: string; phone: string; email: string; paymentChoice: 'deposit' | 'estimate';
};

export type WizardInitial = {
  mode: Mode | null;
  serviceId: string | null;
  promo: string;
  zip: string;
  utm: { source?: string; medium?: string; campaign?: string };
};

export type WizardRates = { calloutFeeCents: number; depositCents: number; diagnosticFeeCents: number };

const DRAFT_KEY = 'ka-booking-draft-v1';
const STEPS = ['Service type', 'Vehicle', 'Issue & photos', 'Schedule & promo', 'Contact & checkout', 'Confirmed'] as const;
const MAKES = ['Acura','Audi','BMW','Buick','Cadillac','Chevrolet','Chrysler','Dodge','Ford','GMC','Honda','Hyundai','Infiniti','Jeep','Kia','Lexus','Lincoln','Mazda','Mercedes-Benz','Mitsubishi','Nissan','Ram','Subaru','Tesla','Toyota','Volkswagen','Volvo'];
const SYMPTOM_CHIPS = ['Won’t start / clicks', 'Check-engine light', 'Grinding or squealing brakes', 'Battery / charging light', 'Leaking fluid', 'Overheating', 'Noise while driving', 'A/C blowing warm'];
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const emptyDraft: Draft = {
  mode: null, zip: '', street: '', city: '', state: 'AL', parkingNotes: '', afterHoursKeyDrop: false,
  year: '', make: '', model: '', engine: '', vin: '', mileage: '',
  serviceIds: [], symptoms: '', date: null, windowId: null, promoCode: '',
  name: '', phone: '', email: '', paymentChoice: 'estimate',
};

// ---------------------------------------------------------------- small UI helpers

const inputCls =
  'h-12 w-full rounded-lg border-2 border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none';

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-bold text-slate-800">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function ChoiceCard({
  active, onClick, icon: Icon, title, sub,
}: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition ${
        active ? 'border-amber-500 bg-amber-50 ring-4 ring-amber-200' : 'border-slate-200 bg-white hover:border-slate-400'
      }`}
    >
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${active ? 'bg-amber-500 text-slate-900' : 'bg-slate-900 text-amber-400'}`}>
        <Icon className="h-6 w-6" />
      </span>
      <span>
        <span className="block font-extrabold">{title}</span>
        <span className="block text-sm text-slate-600">{sub}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- component

export function BookingWizard({ initial, rates, openDates }: { initial: WizardInitial; rates: WizardRates; openDates: string[] }) {
  const router = useRouter();
  const topRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [promo, setPromo] = useState<PromoState>({ state: 'idle', message: '' });
  const [avail, setAvail] = useState<AvailabilityResponse | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v })), []);

  // Restore draft, then apply deep-link params (?mode, ?service, ?promo, ?zip).
  useEffect(() => {
    let base = emptyDraft;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) base = { ...emptyDraft, ...(JSON.parse(raw) as Partial<Draft>), date: null, windowId: null };
    } catch { /* ignore */ }
    const next: Draft = { ...base };
    if (initial.mode) next.mode = initial.mode;
    if (initial.serviceId && SERVICE_BY_ID.has(initial.serviceId)) {
      const svc = SERVICE_BY_ID.get(initial.serviceId)!;
      if (!next.serviceIds.includes(svc.id)) next.serviceIds = [...next.serviceIds, svc.id];
      if (!initial.mode) next.mode = svc.mode === 'shop' ? 'shop' : next.mode;
    }
    if (initial.promo) next.promoCode = initial.promo.toUpperCase();
    if (initial.zip) next.zip = initial.zip;
    if (next.zip && !next.city) {
      const z = findZip(next.zip);
      if (z) { next.city = z.city.replace(/\s*\(.*\)$/, '').split(' / ')[0]!; next.state = z.state; }
    }
    setD(next);
    setHydrated(true);
  }, [initial]);

  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }, [d, hydrated]);

  const coverage = useMemo(
    () => (d.mode === 'mobile' && d.zip.length === 5 ? checkCoverage(d.zip, rates.calloutFeeCents) : null),
    [d.mode, d.zip, rates.calloutFeeCents],
  );

  // Availability for selected date
  useEffect(() => {
    if (!d.date || !d.mode) return;
    const ctrl = new AbortController();
    setAvailLoading(true);
    fetch(`/api/availability?date=${d.date}&mode=${d.mode}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<AvailabilityResponse>) : null))
      .then((j) => setAvail(j))
      .catch(() => {})
      .finally(() => setAvailLoading(false));
    return () => ctrl.abort();
  }, [d.date, d.mode]);

  const checkPromo = useCallback(async (code: string, mode: Mode, email: string) => {
    if (!code) { setPromo({ state: 'idle', message: '' }); return; }
    setPromo({ state: 'checking', message: '' });
    try {
      const q = new URLSearchParams({ code, mode });
      if (email) q.set('email', email);
      const r = await fetch(`/api/promos/validate?${q.toString()}`);
      const j = (await r.json()) as { ok: boolean; reason?: string; promo?: { title: string } };
      setPromo(j.ok ? { state: 'ok', message: j.promo?.title ?? 'Applied' } : { state: 'bad', message: j.reason ?? 'Not valid' });
    } catch {
      setPromo({ state: 'bad', message: 'Could not check that code.' });
    }
  }, []);

  // Auto-validate a deep-linked promo once we reach the schedule step.
  useEffect(() => {
    if (step === 3 && d.promoCode && d.mode && promo.state === 'idle') void checkPromo(d.promoCode, d.mode, d.email);
  }, [step, d.promoCode, d.mode, d.email, promo.state, checkPromo]);

  // ------------------------------------------------------------ uploads
  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const room = 5 - uploads.length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const id = crypto.randomUUID();
      const contentType = file.type || (/\.(heic|heif)$/i.test(file.name) ? 'image/heic' : /\.mov$/i.test(file.name) ? 'video/quicktime' : 'image/jpeg');
      setUploads((u) => [...u, { id, name: file.name, status: 'uploading' }]);
      try {
        const res = await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
        });
        const j = (await res.json()) as { bucket?: string; path?: string; token?: string; error?: string; demo?: boolean };
        if (res.ok && j.demo && j.path) {
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: 'done', path: j.path } : x)));
          continue;
        }
        if (!res.ok || !j.bucket || !j.path || !j.token) throw new Error(j.error ?? 'Upload failed');
        const { error: upErr } = await supabaseBrowser().storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, file, { contentType });
        if (upErr) throw upErr;
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: 'done', path: j.path } : x)));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'Upload failed' } : x)));
      }
    }
  }

  // ------------------------------------------------------------ validation per step
  function validate(s: number): string | null {
    if (s === 0) {
      if (!d.mode) return 'Choose mobile repair or shop drop-off.';
      if (d.mode === 'mobile') {
        if (!/^\d{5}$/.test(d.zip)) return 'Enter the 5-digit ZIP where the vehicle is.';
        if (coverage?.status !== 'mobile') return 'That ZIP is outside our mobile radius — switch to Shop Drop-Off.';
        if (d.street.trim().length < 3) return 'Enter the street address where the vehicle is parked.';
        if (d.city.trim().length < 2) return 'Enter the city.';
      }
    }
    if (s === 1) {
      if (!d.year) return 'Select the vehicle year.';
      if (!d.make.trim() || !d.model.trim()) return 'Enter make and model.';
      if (d.vin && !VIN_RE.test(d.vin)) return 'VIN must be 17 characters (no I, O, or Q) — or leave it blank.';
      if (!/^\d{1,7}$/.test(d.mileage)) return 'Enter approximate mileage.';
    }
    if (s === 2) {
      if (d.serviceIds.length === 0 && d.symptoms.trim().length < 5) return 'Pick a service or describe what’s going on.';
      if (uploads.some((u) => u.status === 'uploading')) return 'Hang on — a file is still uploading.';
    }
    if (s === 3) {
      if (!d.date) return 'Pick a day.';
      if (!d.windowId) return 'Pick an arrival window.';
      if (promo.state === 'checking') return 'Checking your promo code…';
      if (d.promoCode && promo.state === 'bad') return 'Remove or fix the promo code to continue.';
    }
    if (s === 4) {
      if (d.name.trim().length < 2) return 'Enter your name.';
      if (!/^[0-9()+\-.\s]{10,20}$/.test(d.phone)) return 'Enter a mobile number Kyle can text.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'Enter a valid email for your confirmation.';
    }
    return null;
  }

  function go(next: number) {
    if (next > step) {
      const err = validate(step);
      if (err) { setError(err); return; }
    }
    setError(null);
    setStep(next);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit() {
    for (let s = 0; s <= 4; s++) {
      const err = validate(s);
      if (err) { setStep(s); setError(err); return; }
    }
    setSubmitting(true);
    setError(null);
    const utm = initial.utm.source ? initial.utm : readStoredUtm();
    const payload = {
      mode: d.mode,
      contact: { name: d.name, phone: d.phone, email: d.email },
      address: d.mode === 'mobile' ? { street: d.street, city: d.city, state: d.state, zip: d.zip, parkingNotes: d.parkingNotes } : undefined,
      afterHoursKeyDrop: d.afterHoursKeyDrop,
      vehicle: { year: Number(d.year), make: d.make, model: d.model, engine: d.engine, vin: d.vin, mileage: Number(d.mileage) },
      serviceIds: d.serviceIds,
      symptoms: d.symptoms,
      mediaPaths: uploads.filter((u) => u.status === 'done' && u.path).map((u) => u.path),
      date: d.date,
      windowId: d.windowId,
      promoCode: promo.state === 'ok' ? d.promoCode : '',
      paymentChoice: d.paymentChoice,
      utm,
      website: honeypot,
    };
    try {
      const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = (await res.json()) as { ref?: string; checkoutUrl?: string | null; error?: string; field?: string };
      if (!res.ok || !j.ref) {
        const f = j.field ?? '';
        const target = f.startsWith('address') || f === 'mode' ? 0 : f.startsWith('vehicle') ? 1 : f.startsWith('serviceIds') || f.startsWith('symptoms') ? 2 : f === 'windowId' || f === 'promoCode' || f === 'date' ? 3 : 4;
        setStep(target);
        setError(j.error ?? 'Could not book. Please call us.');
        if (f === 'windowId') setD((p) => ({ ...p, windowId: null }));
        setSubmitting(false);
        return;
      }
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      if (j.checkoutUrl) window.location.assign(j.checkoutUrl);
      else router.push(`/book/confirmation/${j.ref}`);
    } catch {
      setError('Network hiccup — check your signal and try again, or tap to call.');
      setSubmitting(false);
    }
  }

  // ------------------------------------------------------------ render
  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  const years = useMemo(() => {
    const now = new Date().getFullYear() + 1;
    return Array.from({ length: now - 1979 }, (_, i) => String(now - i));
  }, []);
  const shop = publicShopAddress();
  const serviceList = d.mode === 'mobile' ? SERVICES.filter((s) => s.mode === 'mobile') : SERVICES;

  return (
    <div ref={topRef} className="mx-auto max-w-2xl scroll-mt-20 px-4 pb-32 pt-6 md:pb-12">
      {/* progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
          <span>Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
          <a href={telHref} className="flex items-center gap-1 text-slate-900 hover:text-amber-600"><Phone className="h-3.5 w-3.5" aria-hidden />Rather call?</a>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </div>
      )}

      {/* STEP 1 — mode */}
      {step === 0 && (
        <section className="space-y-4">
          <h1 className="font-display text-3xl">How should we fix it?</h1>
          <ChoiceCard active={d.mode === 'mobile'} onClick={() => set('mode', 'mobile')} icon={Truck} title="Mobile Dispatch" sub={`We come to your driveway or lot · ${formatCentsShort(rates.calloutFeeCents)} callout`} />
          <ChoiceCard active={d.mode === 'shop'} onClick={() => set('mode', 'shop')} icon={Warehouse} title="Shop Drop-Off" sub="Bring it to the bay · after-hours key drop available" />

          {d.mode === 'mobile' && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <Field label="ZIP where the vehicle is" htmlFor="b-zip">
                <input id="b-zip" className={inputCls} inputMode="numeric" autoComplete="postal-code" maxLength={5} value={d.zip}
                  onChange={(e) => {
                    const zip = e.target.value.replace(/\D/g, '').slice(0, 5);
                    const z = zip.length === 5 ? findZip(zip) : null;
                    setD((p) => ({ ...p, zip, ...(z ? { city: z.city.replace(/\s*\(.*\)$/, '').split(' / ')[0]!, state: z.state } : {}) }));
                  }} />
              </Field>
              {coverage?.status === 'mobile' && (
                <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  <CircleCheck className="h-4 w-4" aria-hidden /> In range — {coverage.entry.city}. Callout {formatCentsShort(coverage.calloutFeeCents)}.
                </p>
              )}
              {coverage && coverage.status !== 'mobile' && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-bold">That ZIP is outside our mobile radius.</p>
                  <button type="button" onClick={() => set('mode', 'shop')} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Switch to Shop Drop-Off</button>
                </div>
              )}
              <Field label="Street address" htmlFor="b-street">
                <input id="b-street" className={inputCls} autoComplete="street-address" value={d.street} onChange={(e) => set('street', e.target.value)} placeholder="123 Main St" />
              </Field>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label="City" htmlFor="b-city">
                  <input id="b-city" className={inputCls} autoComplete="address-level2" value={d.city} onChange={(e) => set('city', e.target.value)} />
                </Field>
                <Field label="State" htmlFor="b-state">
                  <select id="b-state" className={inputCls} value={d.state} onChange={(e) => set('state', e.target.value as 'AL' | 'GA')}>
                    <option value="AL">AL</option>
                    <option value="GA">GA</option>
                  </select>
                </Field>
              </div>
              <Field label="Parking / access notes" htmlFor="b-park" hint="Flat driveway or lot needed. Gate codes, which car, apartment rules, etc.">
                <textarea id="b-park" rows={3} className={`${inputCls} h-auto py-2`} value={d.parkingNotes} onChange={(e) => set('parkingNotes', e.target.value)} placeholder="Silver Camry in the back lot, gate code 1234" />
              </Field>
            </div>
          )}

          {d.mode === 'shop' && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <p className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span><strong>{shop.line}</strong>{shop.note && <span className="block text-slate-500">{shop.note}</span>}</span>
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-slate-200 p-3 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-amber-500" checked={d.afterHoursKeyDrop} onChange={(e) => set('afterHoursKeyDrop', e.target.checked)} />
                <span>
                  <span className="flex items-center gap-1 font-bold"><KeyRound className="h-4 w-4" aria-hidden /> After-hours key drop</span>
                  <span className="block text-sm text-slate-600">Drop the car the night before; key-drop instructions come with your confirmation.</span>
                </span>
              </label>
            </div>
          )}
        </section>
      )}

      {/* STEP 2 — vehicle */}
      {step === 1 && (
        <section className="space-y-4">
          <h1 className="font-display text-3xl">What are we working on?</h1>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year" htmlFor="b-year">
              <select id="b-year" className={inputCls} value={d.year} onChange={(e) => set('year', e.target.value)}>
                <option value="">Year</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Make" htmlFor="b-make">
              <input id="b-make" list="b-makes" className={inputCls} value={d.make} onChange={(e) => set('make', e.target.value)} placeholder="Ford" autoComplete="off" />
              <datalist id="b-makes">{MAKES.map((m) => <option key={m} value={m} />)}</datalist>
            </Field>
          </div>
          <Field label="Model" htmlFor="b-model">
            <input id="b-model" className={inputCls} value={d.model} onChange={(e) => set('model', e.target.value)} placeholder="F-150" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Engine (optional)" htmlFor="b-engine">
              <input id="b-engine" className={inputCls} value={d.engine} onChange={(e) => set('engine', e.target.value)} placeholder="5.0L V8" />
            </Field>
            <Field label="Mileage" htmlFor="b-miles">
              <input id="b-miles" className={inputCls} inputMode="numeric" value={d.mileage} onChange={(e) => set('mileage', e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="128000" />
            </Field>
          </div>
          <Field label="VIN (optional)" htmlFor="b-vin" hint="Lower driver-side windshield or door jamb. Gets the exact parts right the first time.">
            <input id="b-vin" className={`${inputCls} font-mono uppercase tracking-wider`} maxLength={17} value={d.vin} autoCapitalize="characters"
              onChange={(e) => set('vin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))} placeholder="1FTFW1E5XGFA00000" />
          </Field>
        </section>
      )}

      {/* STEP 3 — issue & media */}
      {step === 2 && (
        <section className="space-y-5">
          <h1 className="font-display text-3xl">What’s going on?</h1>
          <div>
            <p className="mb-2 text-sm font-bold">Common services {d.mode === 'mobile' && <span className="font-normal text-slate-500">(mobile-eligible)</span>}</p>
            <div className="flex flex-wrap gap-2">
              {serviceList.map((s) => {
                const on = d.serviceIds.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on}
                    onClick={() => set('serviceIds', on ? d.serviceIds.filter((x) => x !== s.id) : [...d.serviceIds, s.id])}
                    className={`rounded-full border-2 px-3 py-2 text-sm font-semibold transition ${on ? 'border-amber-500 bg-amber-500 text-slate-900' : 'border-slate-300 bg-white hover:border-slate-500'}`}>
                    {on && '✓ '}{s.name}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Describe the problem" htmlFor="b-sym" hint="When it happens, sounds, smells, warning lights. More detail = faster fix.">
            <textarea id="b-sym" rows={4} className={`${inputCls} h-auto py-2`} value={d.symptoms} onChange={(e) => set('symptoms', e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {SYMPTOM_CHIPS.map((c) => (
              <button key={c} type="button" onClick={() => set('symptoms', d.symptoms ? `${d.symptoms.trim()}; ${c}` : c)}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">+ {c}</button>
            ))}
          </div>
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
            <p className="flex items-center gap-2 font-bold"><Camera className="h-5 w-5" aria-hidden /> Photos or video (optional)</p>
            <p className="mt-1 text-sm text-slate-600">Dash lights, leaks, a 10-second clip of the noise. Up to 5 files, 50 MB each.</p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">
              <Upload className="h-4 w-4" aria-hidden /> Add photos / video
              <input type="file" accept="image/*,video/*" multiple className="sr-only" disabled={uploads.length >= 5}
                onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
            </label>
            {uploads.length > 0 && (
              <ul className="mt-3 space-y-2">
                {uploads.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2 text-sm">
                    <span className="truncate">{u.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {u.status === 'uploading' && <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" aria-label="Uploading" />}
                      {u.status === 'done' && <CircleCheck className="h-4 w-4 text-emerald-500" aria-label="Uploaded" />}
                      {u.status === 'error' && <span className="text-xs font-semibold text-red-600">{u.error}</span>}
                      <button type="button" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))} aria-label={`Remove ${u.name}`} className="text-slate-400 hover:text-red-600">
                        <Trash className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* STEP 4 — schedule & promo */}
      {step === 3 && (
        <section className="space-y-5">
          <h1 className="font-display text-3xl">Pick a time</h1>
          <p className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">
            <Clock className="h-4 w-4 text-amber-400" aria-hidden /> All times are Eastern Time (ET) — Phenix City & Columbus local time.
          </p>
          <div>
            <p className="mb-2 text-sm font-bold">Day</p>
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
              {openDates.map((date) => (
                <button key={date} type="button" onClick={() => setD((p) => ({ ...p, date, windowId: null }))}
                  aria-pressed={d.date === date}
                  className={`shrink-0 snap-start rounded-lg border-2 px-3 py-2 text-center text-sm font-bold ${d.date === date ? 'border-amber-500 bg-amber-500 text-slate-900' : 'border-slate-300 bg-white'}`}>
                  {formatDateISO(date)}
                </button>
              ))}
            </div>
          </div>
          {d.date && (
            <div>
              <p className="mb-2 text-sm font-bold">Arrival window <span className="font-normal text-slate-500">({d.mode === 'mobile' ? 'tech arrives' : 'drop-off'})</span></p>
              {availLoading && <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Checking Kyle’s schedule…</p>}
              {!availLoading && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {BOOKING_WINDOWS.map((w) => {
                    const a = avail?.date === d.date ? avail.windows.find((x) => x.id === w.id) : undefined;
                    const available = a ? a.available : false;
                    return (
                      <button key={w.id} type="button" disabled={!available} onClick={() => set('windowId', w.id)} aria-pressed={d.windowId === w.id}
                        className={`flex h-12 items-center justify-between rounded-lg border-2 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${d.windowId === w.id ? 'border-amber-500 bg-amber-500 text-slate-900' : 'border-slate-300 bg-white'}`}>
                        {w.label}
                        <span className="text-xs font-semibold">{available ? (a && a.remaining === 1 ? 'Last spot' : 'Open') : 'Full'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {!availLoading && !avail && <p className="mt-2 text-sm text-red-600">Couldn’t load availability. Pull to refresh or call us.</p>}
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <Field label="Promo code" htmlFor="b-promo">
              <div className="flex gap-2">
                <input id="b-promo" className={`${inputCls} uppercase`} value={d.promoCode} autoCapitalize="characters"
                  onChange={(e) => { set('promoCode', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)); setPromo({ state: 'idle', message: '' }); }} placeholder="FIRSTMOBILE25" />
                <button type="button" disabled={!d.promoCode || !d.mode || promo.state === 'checking'} onClick={() => d.mode && void checkPromo(d.promoCode, d.mode, d.email)}
                  className="rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">Apply</button>
              </div>
            </Field>
            {promo.state === 'ok' && <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-emerald-700"><Tag className="h-4 w-4" aria-hidden />{promo.message} — applied to your estimate.</p>}
            {promo.state === 'bad' && <p className="mt-2 text-sm font-semibold text-red-600">{promo.message}</p>}
          </div>
        </section>
      )}

      {/* STEP 5 — contact & checkout */}
      {step === 4 && (
        <section className="space-y-5">
          <h1 className="font-display text-3xl">Lock it in</h1>
          <div className="grid gap-3">
            <Field label="Your name" htmlFor="b-name">
              <input id="b-name" className={inputCls} autoComplete="name" value={d.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mobile phone" htmlFor="b-phone" hint="Kyle texts arrival updates.">
                <input id="b-phone" type="tel" className={inputCls} autoComplete="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(334) 555-0100" />
              </Field>
              <Field label="Email" htmlFor="b-email" hint="Confirmation + estimate link.">
                <input id="b-email" type="email" className={inputCls} autoComplete="email" value={d.email} onChange={(e) => set('email', e.target.value.trim())} />
              </Field>
            </div>
            {/* honeypot */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="b-website">Website</label>
              <input id="b-website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-bold">How do you want to start?</p>
            <ChoiceCard active={d.paymentChoice === 'estimate'} onClick={() => set('paymentChoice', 'estimate')} icon={FileText}
              title="Free estimate first" sub="Pay nothing now. Approve the itemized estimate before work starts." />
            {rates.depositCents > 0 && (
              <ChoiceCard active={d.paymentChoice === 'deposit'} onClick={() => set('paymentChoice', 'deposit')} icon={CreditCard}
                title={`Hold my slot — ${formatCentsShort(rates.depositCents)} refundable deposit`} sub="Card / Apple Pay / Google Pay via Stripe. Credited to your final invoice." />
            )}
          </div>

          <div className="rounded-xl bg-slate-900 p-4 text-sm text-white">
            <p className="mb-2 flex items-center gap-2 font-extrabold text-amber-400"><CalendarCheck className="h-4 w-4" aria-hidden /> Summary</p>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
              <dt className="text-slate-400">Type</dt><dd>{d.mode === 'mobile' ? `Mobile — ${d.street}, ${d.city}` : 'Shop drop-off'}{d.afterHoursKeyDrop ? ' (key drop)' : ''}</dd>
              <dt className="text-slate-400">Vehicle</dt><dd className="flex items-center gap-1"><Car className="h-3.5 w-3.5" aria-hidden />{[d.year, d.make, d.model].filter(Boolean).join(' ')}</dd>
              <dt className="text-slate-400">Services</dt><dd>{d.serviceIds.map((id) => SERVICE_BY_ID.get(id)?.name).join(', ') || 'Diagnosis'}</dd>
              <dt className="text-slate-400">When</dt><dd>{d.date ? formatDateISO(d.date) : '—'} · {BOOKING_WINDOWS.find((w) => w.id === d.windowId)?.label ?? '—'}</dd>
              {promo.state === 'ok' && (<><dt className="text-slate-400">Promo</dt><dd>{d.promoCode}</dd></>)}
              <dt className="text-slate-400">Due now</dt><dd className="font-bold">{d.paymentChoice === 'deposit' ? formatCents(rates.depositCents) : '$0.00'}</dd>
            </dl>
            <p className="mt-3 text-xs text-slate-400">Diagnostic {formatCentsShort(rates.diagnosticFeeCents)} waived with repair. {BUSINESS.guarantee.display}</p>
          </div>
        </section>
      )}

      {/* nav */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:static md:mt-8 md:border-0 md:bg-transparent md:p-0"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-2xl gap-3">
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)} className="flex h-14 items-center justify-center gap-1 rounded-lg border-2 border-slate-300 px-4 font-bold text-slate-700">
              <ArrowLeft className="h-5 w-5" aria-hidden /> Back
            </button>
          )}
          {step < 4 ? (
            <button type="button" onClick={() => go(step + 1)} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 text-lg font-extrabold text-slate-900 hover:bg-amber-400">
              Continue <ArrowRight className="h-5 w-5" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={() => void submit()} disabled={submitting} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 text-lg font-extrabold text-slate-900 hover:bg-amber-400 disabled:opacity-60">
              {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <CalendarCheck className="h-5 w-5" aria-hidden />}
              {d.paymentChoice === 'deposit' ? 'Continue to secure payment' : 'Confirm booking'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
