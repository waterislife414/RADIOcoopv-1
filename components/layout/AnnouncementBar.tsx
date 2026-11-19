import { getSiteSettings } from '@/lib/content';

/** Kyle's banner message from his Google Sheet (Settings → Banner message). Blank = hidden. */
export async function AnnouncementBar() {
  const { banner } = await getSiteSettings();
  if (!banner) return null;
  return <div className="no-print bg-amber-500 px-4 py-2 text-center text-sm font-bold text-slate-900">{banner}</div>;
}
