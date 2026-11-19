import { requireAdmin } from '@/lib/auth';
import type { BusinessSettingsRow, PromoRow, TaxPresetRow } from '@/lib/db/types';
import { ppmToPercent } from '@/lib/money';
import { createPromo, saveTaxPreset, togglePromo, updateRates } from '../actions';

const input = 'h-10 w-full rounded-md border border-slate-300 px-2 text-sm';
const dollars = (c: number) => (c / 100).toFixed(2);

function PresetForm({ p }: { p?: TaxPresetRow }) {
  return (
    <form action={saveTaxPreset} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_5rem_6rem] md:items-end">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="text-xs font-bold">Name<input name="name" defaultValue={p?.name} required className={input} /></label>
      <label className="text-xs font-bold">State
        <select name="state" defaultValue={p?.state ?? 'AL'} className={input}><option>AL</option><option>GA</option></select>
      </label>
      <label className="text-xs font-bold">Rate %<input name="ratePercent" type="number" step="0.001" min="0" max="20" defaultValue={p ? ppmToPercent(p.rate_ppm) : ''} required className={input} /></label>
      <div className="flex flex-wrap gap-3 text-xs font-bold md:col-span-3">
        {(['parts_taxable', 'labor_taxable', 'fees_taxable', 'is_default', 'active'] as const).map((f) => (
          <label key={f} className="flex items-center gap-1">
            <input type="checkbox" name={f} defaultChecked={p ? Boolean(p[f]) : f === 'parts_taxable' || f === 'active'} className="h-4 w-4 accent-amber-500" />
            {f === 'parts_taxable' ? 'Parts taxable' : f === 'labor_taxable' ? 'Labor taxable' : f === 'fees_taxable' ? 'Fees taxable' : f === 'is_default' ? 'Default' : 'Active'}
          </label>
        ))}
      </div>
      <input name="notes" defaultValue={p?.notes ?? ''} placeholder="Notes" className={`${input} md:col-span-2`} />
      <button className="h-10 rounded-md bg-slate-900 text-sm font-bold text-white">{p ? 'Save' : 'Add preset'}</button>
    </form>
  );
}

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: s }, { data: presets }, { data: promos }] = await Promise.all([
    supabase.from('business_settings').select('*').eq('id', 1).single(),
    supabase.from('tax_presets').select('*').order('is_default', { ascending: false }).order('name'),
    supabase.from('promos').select('*').order('sort'),
  ]);
  const settings = s as BusinessSettingsRow;

  return (
    <div className="space-y-8">
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h1 className="font-display text-2xl">Rates & capacity</h1>
        <p className="text-sm text-slate-600">Changes show on the website within 5 minutes.</p>
        <form action={updateRates} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold">Diagnostic fee $<input name="diagnostic" defaultValue={dollars(settings.diagnostic_fee_cents)} className={input} inputMode="decimal" /></label>
          <label className="text-xs font-bold">Mobile callout $<input name="callout" defaultValue={dollars(settings.mobile_callout_fee_cents)} className={input} inputMode="decimal" /></label>
          <label className="text-xs font-bold">Shop labor $/hr<input name="labor" defaultValue={dollars(settings.shop_labor_rate_cents)} className={input} inputMode="decimal" /></label>
          <label className="text-xs font-bold">Booking deposit $ (0 = off)<input name="deposit" defaultValue={dollars(settings.booking_deposit_cents)} className={input} inputMode="decimal" /></label>
          <label className="text-xs font-bold">Mobile jobs per window<input name="mobileCap" type="number" min={0} max={20} defaultValue={settings.mobile_capacity_per_window} className={input} /></label>
          <label className="text-xs font-bold">Shop drop-offs per window<input name="shopCap" type="number" min={0} max={20} defaultValue={settings.shop_capacity_per_window} className={input} /></label>
          <button className="h-11 rounded-lg bg-amber-500 font-extrabold text-slate-900 sm:col-span-3">Save rates</button>
        </form>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-display text-xl">Sales tax jurisdictions</h2>
        <p className="text-sm text-slate-600">Mobile jobs cross the state line — pick the preset for where the work happens. Confirm rates and labor taxability with your CPA.</p>
        <div className="mt-4 space-y-3">
          {((presets ?? []) as TaxPresetRow[]).map((p) => <PresetForm key={p.id} p={p} />)}
          <PresetForm />
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-display text-xl">Promos</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {((promos ?? []) as PromoRow[]).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span><code className="font-bold">{p.code}</code> {p.title} <span className="text-xs text-slate-500">({p.redemptions} used)</span></span>
              <span className="flex gap-2">
                {(['active', 'featured'] as const).map((f) => (
                  <form key={f} action={togglePromo}>
                    <input type="hidden" name="id" value={p.id} /><input type="hidden" name="field" value={f} /><input type="hidden" name="value" value={String(!p[f])} />
                    <button className={`rounded px-2 py-1 text-xs font-bold ${p[f] ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>{f === 'active' ? (p.active ? 'Active' : 'Off') : p.featured ? 'On home page' : 'Hidden'}</button>
                  </form>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <form action={createPromo} className="mt-4 grid gap-2 rounded-lg border border-dashed border-slate-300 p-3 md:grid-cols-4">
          <input name="code" placeholder="CODE" required className={`${input} uppercase`} />
          <input name="title" placeholder="Title shown to customers" required className={`${input} md:col-span-3`} />
          <input name="description" placeholder="Short description" className={`${input} md:col-span-4`} />
          <select name="discount_type" className={input}><option value="fixed">$ off</option><option value="percent">% off</option><option value="freebie">Freebie</option></select>
          <input name="amount" placeholder="$ amount" inputMode="decimal" className={input} />
          <input name="percent" placeholder="% off" inputMode="numeric" className={input} />
          <select name="scope" className={input}><option value="any">Any job</option><option value="mobile">Mobile only</option><option value="shop">Shop only</option></select>
          <label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" name="featured" defaultChecked className="h-4 w-4 accent-amber-500" />Show on home page</label>
          <label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" name="first_time_only" className="h-4 w-4 accent-amber-500" />First-time customers only</label>
          <button className="h-10 rounded-md bg-slate-900 text-sm font-bold text-white md:col-span-2">Create promo</button>
        </form>
      </section>
    </div>
  );
}
