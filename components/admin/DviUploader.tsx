'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Camera, LoaderCircle } from 'lucide-react';
import { addInspectionPhoto } from '@/app/admin/(protected)/actions';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Rating = 'green' | 'yellow' | 'red';
const RATINGS: { v: Rating; label: string; cls: string }[] = [
  { v: 'green', label: 'Good', cls: 'bg-emerald-500 text-white' },
  { v: 'yellow', label: 'Watch soon', cls: 'bg-amber-400 text-slate-900' },
  { v: 'red', label: 'Urgent', cls: 'bg-red-600 text-white' },
];

/** Snap/choose a photo, rate it, upload to the private inspection bucket under the admin session. */
export function DviUploader({ bookingId, invoiceId }: { bookingId: string | null; invoiceId: string | null }) {
  const router = useRouter();
  const [rating, setRating] = useState<Rating>('yellow');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!file || !title.trim()) { setErr('Add a photo and a title.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${bookingId ?? invoiceId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabaseBrowser().storage.from('inspection-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (error) throw error;
      const res = await addInspectionPhoto({ bookingId, invoiceId, path, rating, title, caption });
      if (!res.ok) throw new Error(res.error ?? 'Save failed');
      setFile(null); setTitle(''); setCaption('');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <p className="flex items-center gap-2 font-extrabold"><Camera className="h-5 w-5" aria-hidden /> Add inspection photo</p>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      <div className="flex gap-2" role="radiogroup" aria-label="Condition">
        {RATINGS.map((r) => (
          <button key={r.v} type="button" role="radio" aria-checked={rating === r.v} onClick={() => setRating(r.v)}
            className={`flex-1 rounded-lg px-2 py-2 text-sm font-bold ${rating === r.v ? `${r.cls} ring-2 ring-slate-900 ring-offset-2` : 'bg-slate-100 text-slate-600'}`}>
            {r.label}
          </button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Front brake pads — 3 mm" className="h-11 w-full rounded-lg border-2 border-slate-300 px-3 text-sm" />
      <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Note for the customer (optional)" className="h-11 w-full rounded-lg border-2 border-slate-300 px-3 text-sm" />
      {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
      <button type="button" onClick={() => void submit()} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 font-bold text-white disabled:opacity-60">
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />} Upload photo
      </button>
    </div>
  );
}
