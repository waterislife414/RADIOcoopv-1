'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import type { VideoSlot } from '@/config/media';
import { PhotoSlot } from '@/components/ui/PhotoSlot';

function embedSrc(v: VideoSlot): string | null {
  if (!v.source) return null;
  if (v.provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.source)}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
  if (v.provider === 'vimeo') return `https://player.vimeo.com/video/${encodeURIComponent(v.source)}?autoplay=1&dnt=1`;
  return null;
}

/** Lite embeds: nothing third-party loads until the visitor taps play. */
function VideoCard({ v, large }: { v: VideoSlot; large: boolean }) {
  const [playing, setPlaying] = useState(false);
  const iframe = embedSrc(v);
  const ready = Boolean(v.source);

  return (
    <figure className={`overflow-hidden rounded-xl bg-slate-800 ${large ? 'md:col-span-2 md:row-span-2' : ''}`}>
      <div className="relative" style={{ aspectRatio: '16 / 9' }}>
        {playing && v.provider === 'mp4' && v.source ? (
          <video src={v.source} poster={v.poster.src ?? undefined} controls autoPlay playsInline preload="none" className="h-full w-full bg-black object-cover" />
        ) : playing && iframe ? (
          <iframe
            src={iframe}
            title={v.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            className="h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => ready && setPlaying(true)}
            disabled={!ready}
            className="group absolute inset-0 h-full w-full text-left disabled:cursor-default"
            aria-label={ready ? `Play: ${v.title} (${v.duration})` : `${v.title} — video coming soon`}
          >
            <PhotoSlot slot={v.poster} dark className="h-full w-full rounded-none" sizes={large ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, 33vw'} />
            <span className="absolute inset-0 grid place-items-center">
              <span className={`grid h-16 w-16 place-items-center rounded-full ${ready ? 'bg-amber-500 group-hover:scale-105' : 'bg-slate-600'} text-slate-900 shadow-xl transition`}>
                <Play className="ml-1 h-7 w-7" fill="currentColor" aria-hidden />
              </span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="font-bold text-white">{v.title}</span>
        <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold text-amber-400">{ready ? v.duration : 'Coming soon'}</span>
      </figcaption>
    </figure>
  );
}

export function VideoShowcase({ videos }: { videos: readonly VideoSlot[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {videos.map((v, i) => (
        <VideoCard key={v.id} v={v} large={i === 0} />
      ))}
    </div>
  );
}
