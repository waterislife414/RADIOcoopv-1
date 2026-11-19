'use client';

import { useEffect } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { BUSINESS, telHref } from '@/config/business';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-900 px-4 text-center text-white">
      <div>
        <h1 className="font-display text-3xl">Something went wrong.</h1>
        <p className="mt-2 text-slate-300">Try again, or call Kyle and we will book you by phone.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => reset()} className={buttonClasses('primary', 'lg')}>
            Try again
          </button>
          <a href={telHref} className={buttonClasses('outlineLight', 'lg')}>
            {BUSINESS.phone.display}
          </a>
        </div>
      </div>
    </main>
  );
}
