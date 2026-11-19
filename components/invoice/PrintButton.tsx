'use client';

import { Printer } from 'lucide-react';

export function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex h-12 items-center gap-2 rounded-lg bg-slate-900 px-5 font-bold text-white hover:bg-slate-800"
    >
      <Printer className="h-5 w-5" aria-hidden /> {label}
    </button>
  );
}
