'use client';

import { useActionState } from 'react';
import { LoaderCircle, Lock } from 'lucide-react';
import { signIn, type LoginState } from './actions';

export function LoginForm({ notAdmin }: { notAdmin: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      {notAdmin && <p className="rounded bg-red-50 p-2 text-sm font-semibold text-red-700">That account isn’t an admin.</p>}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-bold">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="h-12 w-full rounded-lg border-2 border-slate-300 px-3 focus:border-amber-500 focus:outline-none" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-bold">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="h-12 w-full rounded-lg border-2 border-slate-300 px-3 focus:border-amber-500 focus:outline-none" />
      </div>
      {state.error && <p role="alert" className="text-sm font-semibold text-red-600">{state.error}</p>}
      <button disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 font-extrabold text-slate-900 disabled:opacity-60">
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <Lock className="h-5 w-5" aria-hidden />} Sign in
      </button>
    </form>
  );
}
