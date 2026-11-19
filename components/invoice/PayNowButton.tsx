'use client';

import { useState } from 'react';
import { CreditCard, LoaderCircle } from 'lucide-react';
import { formatCents } from '@/lib/money';

export function PayNowButton({ token, balanceCents }: { token: string; balanceCents: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch('/api/checkout/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
          const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
          if (j.url) window.location.assign(j.url);
          else { setErr(j.error ?? 'Could not start payment.'); setBusy(false); }
        }}
        className="flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-xl font-extrabold text-slate-900 shadow-lg shadow-amber-900/20 hover:bg-amber-400 disabled:opacity-60"
      >
        {busy ? <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden /> : <CreditCard className="h-6 w-6" aria-hidden />}
        Pay Now · {formatCents(balanceCents)}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">Card, Apple Pay or Google Pay · Secured by Stripe</p>
      {err && <p role="alert" className="mt-1 text-center text-sm font-semibold text-red-600">{err}</p>}
    </div>
  );
}
