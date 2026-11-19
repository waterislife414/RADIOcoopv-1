import { Clock, ExternalLink, MapPin, Star } from 'lucide-react';
import { BUSINESS } from '@/config/business';
import { REVIEWS } from '@/config/content';
import { buttonClasses } from '@/components/ui/Button';

function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${className} ${i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`} aria-hidden />
      ))}
    </span>
  );
}

export function Reviews() {
  const count = REVIEWS.length;
  const avg = count ? REVIEWS.reduce((s, r) => s + r.rating, 0) / count : 0;

  return (
    <section className="bg-slate-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl">Real jobs. Real neighbors.</h2>
            {count > 0 ? (
              <p className="mt-2 flex items-center gap-2 text-slate-300">
                <Stars value={avg} className="h-5 w-5" />
                <strong className="text-white">{avg.toFixed(1)}</strong> from {count} review{count === 1 ? '' : 's'}
              </p>
            ) : (
              <p className="mt-2 max-w-xl text-slate-300">
                We’re new online — every review here will be a real customer, tied to the real job. Had Kyle work on your car? Tell people how it went.
              </p>
            )}
          </div>
          <a href={BUSINESS.googleReviewUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses('primary', 'md')}>
            <Star className="h-4 w-4" aria-hidden /> Review us on Google <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>

        {count > 0 && (
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {REVIEWS.map((r) => (
              <li key={`${r.author}-${r.date}`} className="flex flex-col rounded-xl bg-slate-800 p-5">
                <p className="inline-flex w-fit flex-wrap items-center gap-x-2 gap-y-1 rounded bg-slate-900 px-2 py-1 text-xs font-bold text-amber-300">
                  {r.job} <span className="flex items-center gap-0.5 text-slate-400"><MapPin className="h-3 w-3" aria-hidden />{r.location}</span>
                  {r.duration && <span className="flex items-center gap-0.5 text-slate-400"><Clock className="h-3 w-3" aria-hidden />{r.duration}</span>}
                </p>
                <Stars value={r.rating} />
                <blockquote className="mt-3 flex-1 text-sm text-slate-200">“{r.text}”</blockquote>
                <p className="mt-4 text-sm font-bold">{r.author} <span className="font-normal text-slate-400">· {r.source === 'google' ? 'Google' : r.source === 'facebook' ? 'Facebook' : 'Verified customer'}</span></p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
