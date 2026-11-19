'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { BeforeAfterPair } from '@/config/media';
import { PhotoSlot } from '@/components/ui/PhotoSlot';

function Slider({ pair }: { pair: BeforeAfterPair }) {
  const [pos, setPos] = useState(50);
  return (
    <figure className="overflow-hidden rounded-xl bg-slate-800">
      <div className="relative" style={{ aspectRatio: pair.before.aspect }}>
        <div className="absolute inset-0">
          <PhotoSlot slot={pair.before} dark className="h-full w-full rounded-none" sizes="(max-width: 768px) 100vw, 50vw" />
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <PhotoSlot slot={pair.after} dark className="h-full w-full rounded-none" sizes="(max-width: 768px) 100vw, 50vw" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-amber-500 shadow-[0_0_0_1px_rgba(0,0,0,.4)]" style={{ left: `${pos}%` }} aria-hidden>
          <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-amber-500 text-xs font-black text-slate-900 shadow-lg">⟷</span>
        </div>
        <span className="absolute left-2 top-2 rounded bg-slate-900/80 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">Before</span>
        <span className="absolute right-2 top-2 rounded bg-emerald-500 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">After</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Compare before and after: ${pair.title}`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-slate-200">
        <span className="font-bold text-white">{pair.title} · {pair.vehicle}</span>
        <span className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" aria-hidden />{pair.location}</span>
      </figcaption>
    </figure>
  );
}

export function BeforeAfter({ pairs }: { pairs: readonly BeforeAfterPair[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {pairs.map((p) => (
        <Slider key={p.id} pair={p} />
      ))}
    </div>
  );
}
