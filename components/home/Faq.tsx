import { ChevronDown } from 'lucide-react';
import { FAQ } from '@/config/content';

/** Native <details> accordion: zero JS, accessible, crawlable. Emits FAQPage JSON-LD. */
export function Faq() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return (
    <section id="faq" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="font-display text-3xl sm:text-4xl">Questions, answered straight</h2>
        <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-amber-600 transition group-open:rotate-180" aria-hidden />
              </summary>
              <p className="px-5 pb-5 text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
    </section>
  );
}
