import { DOCUMENTS, LEGAL_VERSION } from "../../legal/documents";

/** Renders one or more legal documents as plain, readable text. */
export default function LegalText({ docIds }) {
  return (
    <div className="space-y-8 text-slate-700">
      {docIds.map((id) => {
        const doc = DOCUMENTS[id];
        return (
          <article key={id}>
            <h2 className="font-display text-2xl font-bold text-slate-900">{doc.title}</h2>
            <p className="text-xs text-slate-500 mb-4">Version {LEGAL_VERSION}</p>
            {doc.sections.map((s) => (
              <section key={s.h} className="mb-4">
                <h3 className="font-bold text-slate-800 mb-1">{s.h}</h3>
                {s.p.map((t, i) => (
                  <p key={i} className="mb-2 leading-relaxed">
                    {t}
                  </p>
                ))}
              </section>
            ))}
          </article>
        );
      })}
    </div>
  );
}
