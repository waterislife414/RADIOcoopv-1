'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CircleCheck, LoaderCircle, Plus, Save, Trash } from 'lucide-react';
import { saveInvoice, type InvoicePayload } from '@/app/admin/(protected)/actions';
import type { TaxPresetRow } from '@/lib/db/types';
import { LINE_TYPE_LABEL, computeTotals, defaultTaxable, lineTotalCents, type LineType } from '@/lib/invoice-math';
import { dollarsToCents, formatCents, formatPpm } from '@/lib/money';

type Line = { key: string; type: LineType; description: string; quantity: string; unitPrice: string; taxable: boolean };

export type BuilderInitial = {
  id: string | null;
  bookingId: string | null;
  customerId: string | null;
  vehicleId: string | null;
  mode: 'mobile' | 'shop';
  customer: { name: string; email: string; phone: string };
  vehicle: { year: string; make: string; model: string; engine: string; vin: string };
  odometer: string;
  taxPresetId: string;
  notes: string;
  depositAppliedCents: number;
  lines: { type: LineType; description: string; quantity: number; unitPriceCents: number; taxable: boolean }[];
  locked: boolean;
};

const cell = 'h-10 w-full rounded-md border border-slate-300 px-2 text-sm focus:border-amber-500 focus:outline-none';
const newKey = () => Math.random().toString(36).slice(2);

export function InvoiceBuilder({
  initial, presets, rates,
}: {
  initial: BuilderInitial;
  presets: TaxPresetRow[];
  rates: { laborCents: number; calloutCents: number; diagnosticCents: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [customer, setCustomer] = useState(initial.customer);
  const [vehicle, setVehicle] = useState(initial.vehicle);
  const [odometer, setOdometer] = useState(initial.odometer);
  const [mode, setMode] = useState(initial.mode);
  const [presetId, setPresetId] = useState(initial.taxPresetId || presets.find((p) => p.is_default)?.id || presets[0]?.id || '');
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<Line[]>(
    initial.lines.map((l) => ({ key: newKey(), type: l.type, description: l.description, quantity: String(l.quantity), unitPrice: (l.unitPriceCents / 100).toFixed(2), taxable: l.taxable })),
  );

  const preset = presets.find((p) => p.id === presetId);
  const rules = { partsTaxable: preset?.parts_taxable ?? true, laborTaxable: preset?.labor_taxable ?? false, feesTaxable: preset?.fees_taxable ?? false };
  const parsed = lines.map((l) => ({ type: l.type, description: l.description, quantity: Number(l.quantity) || 0, unitPriceCents: dollarsToCents(l.unitPrice) ?? 0, taxable: l.taxable }));
  const totals = useMemo(() => computeTotals(parsed, preset?.rate_ppm ?? 0), [parsed, preset?.rate_ppm]);
  const balance = Math.max(0, totals.totalCents - initial.depositAppliedCents);

  const add = (type: LineType, description = '', unitCents = 0, quantity = 1) =>
    setLines((ls) => [...ls, { key: newKey(), type, description, quantity: String(quantity), unitPrice: (unitCents / 100).toFixed(2), taxable: defaultTaxable(type, rules) }]);
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const reapplyTax = () => setLines((ls) => ls.map((l) => ({ ...l, taxable: defaultTaxable(l.type, rules) })));

  function save() {
    setMsg(null);
    const payload: InvoicePayload = {
      id: initial.id,
      bookingId: initial.bookingId,
      customerId: initial.customerId,
      vehicleId: initial.vehicleId,
      mode,
      customer,
      vehicle: { ...vehicle, year: vehicle.year ? Number(vehicle.year) : null },
      odometer: odometer ? Number(odometer) : null,
      taxPresetId: presetId,
      notes,
      depositAppliedCents: initial.depositAppliedCents,
      lines: parsed,
    };
    start(async () => {
      const r = await saveInvoice(payload);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: 'Saved' });
      if (!initial.id) router.replace(`/admin/invoices/${r.id}`);
      else router.refresh();
    });
  }

  const disabled = initial.locked;

  return (
    <div className="space-y-4">
      <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
          <p className="font-extrabold">Customer</p>
          <input className={cell} placeholder="Full name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={cell} placeholder="Email" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
            <input className={cell} placeholder="Phone" type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-1 text-sm font-bold">
            {(['mobile', 'shop'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-md py-2 ${mode === m ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{m === 'mobile' ? 'Mobile job' : 'Shop job'}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
          <p className="font-extrabold">Vehicle</p>
          <div className="grid grid-cols-[5rem_1fr_1fr] gap-2">
            <input className={cell} placeholder="Year" inputMode="numeric" value={vehicle.year} onChange={(e) => setVehicle({ ...vehicle, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            <input className={cell} placeholder="Make" value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} />
            <input className={cell} placeholder="Model" value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={`${cell} font-mono uppercase`} placeholder="VIN" maxLength={17} value={vehicle.vin} onChange={(e) => setVehicle({ ...vehicle, vin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
            <input className={cell} placeholder="Odometer" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, '').slice(0, 7))} />
          </div>
          <input className={cell} placeholder="Engine" value={vehicle.engine} onChange={(e) => setVehicle({ ...vehicle, engine: e.target.value })} />
        </div>
      </fieldset>

      <fieldset disabled={disabled} className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="tax" className="text-sm font-extrabold">Tax jurisdiction</label>
            <select id="tax" className={cell} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatPpm(p.rate_ppm)}</option>)}
            </select>
            {preset && (
              <p className="mt-1 text-xs text-slate-500">
                Taxable by default: {[preset.parts_taxable && 'parts/supplies', preset.labor_taxable && 'labor', preset.fees_taxable && 'fees'].filter(Boolean).join(', ') || 'nothing'}.{' '}
                <button type="button" onClick={reapplyTax} className="font-bold text-amber-700 underline">Re-apply to all lines</button>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <button type="button" onClick={() => add('labor', 'Labor', rates.laborCents, 1)} className="rounded-md bg-slate-900 px-2.5 py-2 text-white"><Plus className="inline h-3 w-3" aria-hidden /> Labor {formatCents(rates.laborCents)}/hr</button>
            <button type="button" onClick={() => add('part')} className="rounded-md bg-slate-900 px-2.5 py-2 text-white"><Plus className="inline h-3 w-3" aria-hidden /> Part</button>
            <button type="button" onClick={() => add('fee', 'Mobile callout fee', rates.calloutCents)} className="rounded-md bg-slate-200 px-2.5 py-2">+ Callout</button>
            <button type="button" onClick={() => add('fee', 'Diagnostic fee', rates.diagnosticCents)} className="rounded-md bg-slate-200 px-2.5 py-2">+ Diagnostic</button>
            <button type="button" onClick={() => add('supply', 'Shop supplies', 1500)} className="rounded-md bg-slate-200 px-2.5 py-2">+ Supplies</button>
            <button type="button" onClick={() => add('discount', 'Diagnostic fee waived with repair', rates.diagnosticCents)} className="rounded-md bg-emerald-100 px-2.5 py-2 text-emerald-800">+ Waive diag</button>
            <button type="button" onClick={() => add('discount', 'Discount')} className="rounded-md bg-emerald-100 px-2.5 py-2 text-emerald-800">+ Discount</button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-[6.5rem_1fr] gap-2 rounded-lg border border-slate-200 p-2 md:grid-cols-[7rem_1fr_5rem_7rem_4.5rem_6rem_2rem] md:items-center">
              <select className={cell} value={l.type} onChange={(e) => { const t = e.target.value as LineType; update(l.key, { type: t, taxable: defaultTaxable(t, rules) }); }}>
                {(Object.keys(LINE_TYPE_LABEL) as LineType[]).map((t) => <option key={t} value={t}>{LINE_TYPE_LABEL[t]}</option>)}
              </select>
              <input className={cell} placeholder="Description" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
              <input className={cell} aria-label={l.type === 'labor' ? 'Hours' : 'Quantity'} inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              <input className={cell} aria-label="Unit price" inputMode="decimal" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} />
              <label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={l.taxable} onChange={(e) => update(l.key, { taxable: e.target.checked })} className="h-4 w-4 accent-amber-500" /> Tax</label>
              <span className="text-right text-sm font-bold tabular-nums">{formatCents(lineTotalCents({ type: l.type, quantity: Number(l.quantity) || 0, unitPriceCents: dollarsToCents(l.unitPrice) ?? 0 }))}</span>
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line" className="justify-self-end text-slate-400 hover:text-red-600"><Trash className="h-4 w-4" /></button>
            </div>
          ))}
          {lines.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Add labor, parts and fees with the buttons above.</p>}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <textarea rows={4} className="w-full rounded-md border border-slate-300 p-2 text-sm" placeholder="Technician notes shown to the customer" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <dl className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between"><dt>Parts + supplies</dt><dd>{formatCents(totals.partsCents + totals.suppliesCents)}</dd></div>
            <div className="flex justify-between"><dt>Labor</dt><dd>{formatCents(totals.laborCents)}</dd></div>
            <div className="flex justify-between"><dt>Fees</dt><dd>{formatCents(totals.feesCents)}</dd></div>
            {totals.discountCents > 0 && <div className="flex justify-between text-emerald-700"><dt>Discounts</dt><dd>−{formatCents(totals.discountCents)}</dd></div>}
            <div className="flex justify-between"><dt>Tax on {formatCents(totals.taxableCents)} @ {formatPpm(preset?.rate_ppm ?? 0)}</dt><dd>{formatCents(totals.taxCents)}</dd></div>
            <div className="flex justify-between border-t-2 border-slate-900 pt-1 text-base font-black"><dt>Total</dt><dd>{formatCents(totals.totalCents)}</dd></div>
            {initial.depositAppliedCents > 0 && <div className="flex justify-between text-emerald-700"><dt>Deposit applied</dt><dd>−{formatCents(initial.depositAppliedCents)}</dd></div>}
            <div className="flex justify-between font-bold"><dt>Customer owes</dt><dd>{formatCents(balance)}</dd></div>
          </dl>
        </div>
      </fieldset>

      {!disabled && (
        <div className="sticky bottom-3 z-20 flex items-center gap-3">
          <button type="button" onClick={save} disabled={pending} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 font-extrabold text-slate-900 shadow-lg disabled:opacity-60 md:flex-none md:px-8">
            {pending ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <Save className="h-5 w-5" aria-hidden />} Save estimate
          </button>
          {msg && <span className={`flex items-center gap-1 text-sm font-bold ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.ok && <CircleCheck className="h-4 w-4" aria-hidden />}{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
