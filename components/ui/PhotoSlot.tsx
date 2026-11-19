import Image from 'next/image';
import { Camera } from 'lucide-react';
import type { PhotoSlot as Slot } from '@/config/media';
import { SHOW_PHOTO_GUIDANCE } from '@/config/media';

/**
 * Renders a real photo when `slot.src` is set; otherwise a labeled placeholder carrying
 * the aspect ratio + shot guidance (toggle via SHOW_PHOTO_GUIDANCE before launch).
 */
export function PhotoSlot({
  slot,
  sizes = '(max-width: 768px) 100vw, 50vw',
  priority = false,
  className = '',
  dark = false,
}: {
  slot: Slot;
  sizes?: string;
  priority?: boolean;
  className?: string;
  dark?: boolean;
}) {
  if (slot.src) {
    return (
      <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ aspectRatio: slot.aspect }}>
        <Image
          src={slot.src}
          alt={slot.alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={slot.alt}
      data-photo-slot={slot.id}
      className={`relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed p-4 text-center ${
        dark ? 'border-white/20 bg-slate-800/60 text-slate-300 grid-plate' : 'border-slate-300 bg-slate-100 text-slate-500'
      } ${className}`}
      style={{ aspectRatio: slot.aspect }}
    >
      <Camera className="h-7 w-7 opacity-70" aria-hidden />
      <span className="text-[11px] font-bold uppercase tracking-widest">Photo · {slot.aspect.replace(/\s/g, '')}</span>
      {SHOW_PHOTO_GUIDANCE && <span className="max-w-sm text-xs leading-snug opacity-80">{slot.guidance}</span>}
    </div>
  );
}
