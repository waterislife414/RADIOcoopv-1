import type { Metadata } from 'next';
import { Wrench } from 'lucide-react';
import { DEMO } from '@/lib/demo';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Admin sign in', robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-amber-500"><Wrench className="h-5 w-5" aria-hidden /></span>
          <div>
            <p className="font-display text-lg leading-none">Dubois Rescue Admin</p>
            <p className="text-xs text-slate-500">Jobs · Estimates · QR Studio</p>
          </div>
        </div>
        {DEMO ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Kyle’s dashboard (jobs board, estimate builder, QR Studio) signs in with his Supabase account, so it’s turned off in this preview.</p>
        ) : (
          <LoginForm notAdmin={sp.error === 'not_admin'} />
        )}
      </div>
    </main>
  );
}
