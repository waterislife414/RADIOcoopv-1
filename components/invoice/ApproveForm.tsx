'use client';

import { useActionState } from 'react';
import { LoaderCircle, PenLine } from 'lucide-react';
import type { ApproveState } from '@/app/invoice/[token]/actions';
import { formatCents } from '@/lib/money';

export function ApproveForm({
  action,
  totalCents,
}: {
  action: (prev: ApproveState, fd: FormData) => Promise<ApproveState>;
  totalCents: number;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false });

  if (state.ok) {
    return <p className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 font-bold text-emerald-800">Approved — thank you! Kyle has been notified and will get started.</p>;
  }

  return (
    <form action={formAction} className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
      <p className="flex items-center gap-2 font-extrabold"><PenLine className="h-5 w-5" aria-hidden /> Approve this estimate</p>
      <p className="mt-1 text-sm text-slate-700">
        Type your full name to authorize the work above for an estimated {formatCents(totalCents)}. Anything additional requires a new approval.
      </p>
      <label htmlFor="sig" className="sr-only">Typed signature</label>
      <input
        id="sig"
        name="signature"
        required
        minLength={2}
        maxLength={80}
        autoComplete="name"
        placeholder="Your full name"
        className="mt-3 h-14 w-full rounded-lg border-2 border-slate-300 bg-white px-3 font-serif text-xl italic focus:border-amber-500 focus:outline-none"
      />
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 accent-amber-500" />
        <span>I authorize this work and agree my typed name is my electronic signature. Timestamp and device are recorded.</span>
      </label>
      {state.error && <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-lg font-extrabold text-white disabled:opacity-60">
        {pending && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />} Approve Estimate
      </button>
    </form>
  );
}
