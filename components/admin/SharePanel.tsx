'use client';

import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, MessageSquare } from 'lucide-react';
import { qrSvg } from '@/lib/qr';
import { downloadBlob, qrPngBlob } from '@/lib/qr-png';

export function SharePanel({ url, smsText, phone, number }: { url: string; smsText: string; phone: string | null; number: string }) {
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void qrSvg(url, { label: 'SCAN TO VIEW & PAY', sublabel: number, margin: 3 }).then(setSvg);
  }, [url, number]);

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <p className="font-extrabold">Share with customer</p>
      <div className="flex gap-2">
        <input readOnly value={url} className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-2 font-mono text-xs" aria-label="Customer link" />
        <button type="button" onClick={() => void copy(url, 'link')} className="rounded-md bg-slate-900 px-3 text-xs font-bold text-white"><Copy className="h-4 w-4" aria-label="Copy link" /></button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="grid place-items-center rounded-md bg-slate-200 px-3" aria-label="Open customer view"><ExternalLink className="h-4 w-4" /></a>
      </div>
      <textarea readOnly value={smsText} rows={4} className="w-full rounded-md border border-slate-300 bg-slate-50 p-2 text-xs" aria-label="SMS template" />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void copy(smsText, 'sms')} className="flex h-10 items-center justify-center gap-1 rounded-md bg-slate-200 text-xs font-bold"><Copy className="h-4 w-4" aria-hidden />Copy text</button>
        {phone && (
          <a href={`sms:${phone}?&body=${encodeURIComponent(smsText)}`} className="flex h-10 items-center justify-center gap-1 rounded-md bg-slate-900 text-xs font-bold text-white"><MessageSquare className="h-4 w-4" aria-hidden />Open Messages</a>
        )}
      </div>
      {copied && <p className="text-xs font-bold text-emerald-700">Copied {copied}</p>}
      {svg && <div className="mx-auto w-48" dangerouslySetInnerHTML={{ __html: svg }} />}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${number}-pay-qr.svg`)} className="flex h-10 items-center justify-center gap-1 rounded-md bg-slate-200 text-xs font-bold"><Download className="h-4 w-4" aria-hidden />SVG</button>
        <button type="button" onClick={() => void qrPngBlob(url, { label: 'SCAN TO VIEW & PAY', sublabel: number, margin: 3 }).then((b) => downloadBlob(b, `${number}-pay-qr.png`))} className="flex h-10 items-center justify-center gap-1 rounded-md bg-slate-200 text-xs font-bold"><Download className="h-4 w-4" aria-hidden />PNG 2048px</button>
      </div>
    </div>
  );
}
