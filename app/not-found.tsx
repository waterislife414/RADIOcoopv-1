import Link from 'next/link';
import { BUSINESS, telHref } from '@/config/business';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-900 px-4 text-center text-white">
      <div>
        <p className="font-display text-6xl text-amber-400">404</p>
        <h1 className="mt-2 text-2xl font-extrabold">That page took a wrong turn.</h1>
        <p className="mt-2 text-slate-300">If you followed a link from Kyle, it may have expired. Call or start a new booking.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/book" className="rounded-lg bg-amber-500 px-5 py-3 font-extrabold text-slate-900">Book a repair</Link>
          <a href={telHref} className="rounded-lg border-2 border-white px-5 py-3 font-extrabold">{BUSINESS.phone.display}</a>
        </div>
      </div>
    </main>
  );
}
