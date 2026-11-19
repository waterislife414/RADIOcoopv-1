/* eslint-disable @next/next/no-img-element -- short-lived signed URLs from a private bucket */
import { Camera } from 'lucide-react';
import type { SignedPhoto } from '@/lib/invoices';

const RATING = {
  red: { label: 'Urgent', cls: 'bg-red-600 text-white', ring: 'ring-red-500' },
  yellow: { label: 'Watch soon', cls: 'bg-amber-400 text-slate-900', ring: 'ring-amber-400' },
  green: { label: 'Good', cls: 'bg-emerald-500 text-white', ring: 'ring-emerald-500' },
} as const;

export function DviGallery({ photos }: { photos: SignedPhoto[] }) {
  if (photos.length === 0) return null;
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const p of photos) counts[p.rating]++;
  return (
    <section aria-labelledby="dvi-h" className="mt-8">
      <h2 id="dvi-h" className="flex items-center gap-2 text-lg font-extrabold"><Camera className="h-5 w-5" aria-hidden /> Digital Vehicle Inspection</h2>
      <p className="mt-1 flex flex-wrap gap-2 text-xs font-bold">
        {(['red', 'yellow', 'green'] as const).map((r) => (
          <span key={r} className={`rounded px-2 py-0.5 ${RATING[r].cls}`}>{counts[r]} {RATING[r].label}</span>
        ))}
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <li key={p.id} className={`overflow-hidden rounded-lg bg-white ring-2 ${RATING[p.rating].ring} print:break-inside-avoid`}>
            {p.url ? (
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={p.url} alt={p.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </a>
            ) : (
              <div className="grid aspect-[4/3] place-items-center bg-slate-100 text-xs text-slate-500">Photo unavailable</div>
            )}
            <div className="p-2">
              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${RATING[p.rating].cls}`}>{RATING[p.rating].label}</span>
              <p className="mt-1 text-sm font-bold leading-tight">{p.title}</p>
              {p.caption && <p className="text-xs text-slate-600">{p.caption}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
