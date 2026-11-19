'use client';

import { useState } from 'react';
import { CreditCard, LoaderCircle } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';

export function RetryDepositButton({ refCode }: { refCode: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        disabled={busy}
        className={buttonClasses('primary', 'lg', 'w-full')}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch('/api/checkout/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: refCode }) });
          const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
          if (j.url) window.location.assign(j.url);
          else { setErr(j.error ?? 'Could not start payment.'); setBusy(false); }
        }}
      >
        {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <CreditCard className="h-5 w-5" aria-hidden />} Pay deposit
      </button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
