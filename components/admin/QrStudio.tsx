'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { qrSvg, withUtm } from '@/lib/qr';
import { downloadBlob, qrPngBlob } from '@/lib/qr-png';

type Preset = { id: string; name: string; use: string; url: string; label: string; sublabel: string };
type InvoiceOption = { token: string; number: string; customer: string };

const INK = '#0F172A';

function QrCard({ preset }: { preset: Preset }) {
  const [label, setLabel] = useState(preset.label);
  const [sublabel, setSublabel] = useState(preset.sublabel);
  const [fg, setFg] = useState(INK);
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void qrSvg(preset.url, { label: label || undefined, sublabel: sublabel || undefined, fg, errorCorrectionLevel: 'Q', margin: 4 }).then((s) => alive && setSvg(s));
    return () => { alive = false; };
  }, [preset.url, label, sublabel, fg]);

  const file = preset.id;
  return (
    <li className="flex flex-col rounded-xl bg-white p-4 shadow-sm">
      <p className="font-extrabold">{preset.name}</p>
      <p className="text-xs text-slate-500">{preset.use}</p>
      <div className="mx-auto my-3 w-44" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="space-y-2">
        <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 32))} placeholder="Label (optional)" className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" aria-label="Label" />
        <input value={sublabel} onChange={(e) => setSublabel(e.target.value.slice(0, 40))} placeholder="Sub-label (optional)" className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" aria-label="Sub-label" />
        <div className="flex items-center gap-2 text-xs font-bold">
          Color
          {[INK, '#000000', '#B45309'].map((c) => (
            <button key={c} type="button" onClick={() => setFg(c)} aria-label={`Color ${c}`} className={`h-6 w-6 rounded-full border-2 ${fg === c ? 'border-amber-500' : 'border-white'}`} style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md bg-slate-50 p-1.5">
          <code className="min-w-0 flex-1 truncate text-[11px]">{preset.url}</code>
          <button type="button" aria-label="Copy URL" onClick={async () => { await navigator.clipboard.writeText(preset.url); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
            <Copy className={`h-4 w-4 ${copied ? 'text-emerald-600' : 'text-slate-500'}`} />
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${file}.svg`)} className="flex h-10 items-center justify-center gap-1 rounded-md bg-slate-900 text-xs font-bold text-white"><Download className="h-4 w-4" aria-hidden />SVG (print)</button>
        <button type="button" onClick={() => void qrPngBlob(preset.url, { label: label || undefined, sublabel: sublabel || undefined, fg, errorCorrectionLevel: 'Q', sizePx: 2400 }).then((b) => downloadBlob(b, `${file}.png`))} className="flex h-10 items-center justify-center gap-1 rounded-md bg-slate-200 text-xs font-bold"><Download className="h-4 w-4" aria-hidden />PNG 2400px</button>
      </div>
    </li>
  );
}

export function QrStudio({ siteUrl, googleReviewUrl, phone, invoices }: { siteUrl: string; googleReviewUrl: string; phone: string; invoices: InvoiceOption[] }) {
  const [invoiceToken, setInvoiceToken] = useState(invoices[0]?.token ?? '');
  const [customPath, setCustomPath] = useState('/book');
  const [customSource, setCustomSource] = useState('flyer');

  const presets: Preset[] = useMemo(() => {
    const inv = invoices.find((i) => i.token === invoiceToken);
    const list: Preset[] = [
      { id: 'truck-tailgate', name: 'Truck wrap / tailgate', use: 'Unlocks TRUCK25 on the home page', url: withUtm(`${siteUrl}/?offer=TRUCK25`, { source: 'truck', campaign: 'truck-wrap' }), label: 'SCAN FOR $25 OFF', sublabel: phone },
      { id: 'oil-sticker', name: 'Oil-change windshield sticker', use: 'Pre-selects oil change in booking', url: withUtm(`${siteUrl}/book?service=oil-change`, { source: 'sticker', campaign: 'oil-reminder' }), label: 'NEXT OIL CHANGE', sublabel: 'Scan to book' },
      { id: 'business-card', name: 'Business card / shop counter', use: 'Opens booking', url: withUtm(`${siteUrl}/book`, { source: 'card', campaign: 'counter' }), label: 'BOOK A REPAIR', sublabel: phone },
      { id: 'google-review', name: 'Google review', use: 'Direct link to leave a review', url: googleReviewUrl, label: 'LEAVE US A REVIEW', sublabel: 'Thank you!' },
    ];
    if (inv) list.push({ id: `invoice-${inv.number}`, name: `Invoice payment — ${inv.number}`, use: inv.customer, url: `${siteUrl}/invoice/${inv.token}`, label: 'SCAN TO PAY', sublabel: inv.number });
    if (customPath.startsWith('/')) list.push({ id: `custom-${customSource || 'qr'}`, name: 'Custom placement', use: 'Your own path + source', url: withUtm(`${siteUrl}${customPath}`, { source: customSource || 'qr', campaign: 'custom' }), label: '', sublabel: '' });
    return list;
  }, [siteUrl, googleReviewUrl, phone, invoices, invoiceToken, customPath, customSource]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="text-sm font-bold">Invoice for payment QR
          <select value={invoiceToken} onChange={(e) => setInvoiceToken(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 font-normal">
            {invoices.length === 0 && <option value="">No open invoices</option>}
            {invoices.map((i) => <option key={i.token} value={i.token}>{i.number} — {i.customer}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold">Custom path
          <input value={customPath} onChange={(e) => setCustomPath(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 font-mono font-normal" />
        </label>
        <label className="text-sm font-bold">Custom utm_source
          <input value={customSource} onChange={(e) => setCustomSource(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 font-normal" />
        </label>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {presets.map((p) => <QrCard key={p.id + p.url} preset={p} />)}
      </ul>
      <p className="text-xs text-slate-500">SVG is vector — send it to the wrap/sticker printer. Keep printed codes ≥ 1 inch per 10 ft of scan distance (tailgate: ~6 in). Error correction Q survives scratches and dirt.</p>
    </div>
  );
}
