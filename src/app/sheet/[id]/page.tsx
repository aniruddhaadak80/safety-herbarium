import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSheet, listSheets } from "@/lib/service";
import { errorEnvelope } from "@/lib/errors";
import { affinitiesFor, CLASS_BY_ID, TIER_WEIGHT } from "@/lib/taxonomy";
import { SheetAnnotation } from "@/components/sheet-annotation";
import { ExternalLink, FileText, Quote } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * One mounted sheet, read as a specimen sheet.
 *
 * The specimen is the paper itself: the full text is embedded from the
 * publisher's own host, never mirrored. Beside it the determination block states
 * which risk class the engine matched and why, with the lexicon terms that fired.
 * The wide outer margin is where the reader's own note lives.
 */
export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = (await cookies()).get("hb_scope")?.value ?? "";

  const sheet = await getSheet(scope, id).catch((error: unknown) => {
    const { status } = errorEnvelope(error);
    if (status === 404) notFound();
    throw error;
  });

  const siblings = await listSheets(scope, sheet.volumeId);
  const affinities = affinitiesFor({
    title: sheet.title,
    abstract: sheet.abstract,
    determinations: sheet.determinations,
  });

  const firedTerms = Object.values(CLASS_BY_ID)
    .map((riskClass) => {
      const haystack = ` ${`${sheet.title} ${sheet.abstract}`.toLowerCase().replace(/\s+/g, " ")} `;
      const matched = riskClass.lexicon
        .filter((term) => haystack.includes(term.term))
        .sort((a, b) => b.weight - a.weight);
      return { riskClass, matched };
    })
    .filter((entry) => entry.matched.length > 0)
    .sort((a, b) => affinities[b.riskClass.id] - affinities[a.riskClass.id]);

  const topClass = firedTerms[0]?.riskClass;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="label-caps">
        <Link href="/shelf" className="underline decoration-rule underline-offset-4 hover:text-field">
          Shelf
        </Link>
        <span aria-hidden> / </span>
        <Link
          href={`/volume/${sheet.volumeId}`}
          className="underline decoration-rule underline-offset-4 hover:text-field"
        >
          Volume
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-soft">{sheet.accession}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <article>
          <header className="border-b border-ink pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-stamp">{sheet.accession}</span>
              <span className="label-stamp">{sheet.sourceKind === "arxiv" ? "arXiv" : "open-access"}</span>
              <span className="label-stamp">{sheet.status}</span>
              {sheet.decision ? <span className="label-stamp">{sheet.decision}</span> : null}
              {sheet.provenance === "fallback" ? (
                <span className="label-stamp text-fallback">from snapshot</span>
              ) : null}
            </div>

            <h1 className="mt-3 font-[family-name:var(--font-bodoni)] text-3xl leading-tight tracking-tight">
              {sheet.title}
            </h1>

            <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
              {sheet.authors.length > 0 ? sheet.authors.join(", ") : "Authors not recorded"}
            </p>

            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 figure text-xs text-ink-faint">
              {sheet.publishedAt ? (
                <div className="flex gap-1.5">
                  <dt>published</dt>
                  <dd className="text-ink-soft">{sheet.publishedAt}</dd>
                </div>
              ) : null}
              <div className="flex gap-1.5">
                <dt>tier</dt>
                <dd className="text-ink-soft">
                  {sheet.tier} (×{TIER_WEIGHT[sheet.tier]})
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt>citations</dt>
                <dd className="text-ink-soft">{sheet.citations}</dd>
              </div>
              {sheet.license ? (
                <div className="flex gap-1.5">
                  <dt>licence</dt>
                  <dd className="text-ink-soft">{sheet.license}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={sheet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-sm border border-ink px-3 py-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                Landing page
              </a>
              {sheet.pdfUrl ? (
                <a
                  href={sheet.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-3 py-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-field hover:text-field"
                >
                  <FileText className="h-3 w-3" aria-hidden />
                  Open PDF
                </a>
              ) : null}
            </div>
          </header>

          <section className="mt-5" aria-labelledby="abstract-heading">
            <h2 id="abstract-heading" className="label-caps">
              Abstract
            </h2>
            <p className="mt-2 font-[family-name:var(--font-body)] text-[0.9375rem] leading-[1.7] text-ink">
              {sheet.abstract || "No abstract was supplied by the source."}
            </p>
          </section>

          {sheet.pdfUrl ? (
            <section className="mt-6" aria-labelledby="fulltext-heading">
              <h2 id="fulltext-heading" className="label-caps">
                Full text
              </h2>
              <p className="mt-1 font-[family-name:var(--font-body)] text-xs text-ink-faint">
                Streamed from the publisher&apos;s own host at {sheet.host}. Nothing is mirrored.
              </p>
              <object
                data={sheet.pdfUrl}
                type="application/pdf"
                className="mt-2 h-[32rem] w-full rounded-sm border border-paper-edge"
                aria-label={`PDF of ${sheet.title}`}
              >
                <p className="font-[family-name:var(--font-body)] text-sm text-ink-soft">
                  Your browser cannot display this PDF inline.{" "}
                  <a
                    href={sheet.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-rule underline-offset-4"
                  >
                    Open it directly
                  </a>
                  .
                </p>
              </object>
            </section>
          ) : null}
        </article>

        <aside className="space-y-5">
          <section className="sheet p-4" aria-labelledby="determination-heading">
            <h2 id="determination-heading" className="label-caps">
              Determination
            </h2>
            <p className="mt-2">
              <span className="determination text-xl">{topClass?.label ?? "Undetermined"}</span>
            </p>
            <p className="mt-1 font-[family-name:var(--font-body)] text-sm text-ink-soft">
              {topClass?.blurb ?? "The lexicon matched no risk class strongly on this record."}
            </p>

            <h3 className="label-caps mt-4">Affinity by class</h3>
            <ul className="mt-2 space-y-1.5">
              {Object.entries(affinities)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([classId, affinity]) => (
                  <li key={classId} className="flex items-center gap-2">
                    <span className="figure w-7 shrink-0 text-[0.625rem] text-ink-faint">
                      {CLASS_BY_ID[classId as keyof typeof CLASS_BY_ID].code}
                    </span>
                    <div className="bar-track flex-1" aria-hidden>
                      <div
                        className={classId === sheet.mountedClass ? "bar-fill" : "bar-fill-gap"}
                        style={{ width: `${Math.max(1.5, affinity * 100)}%` }}
                      />
                    </div>
                    <span className="figure w-10 shrink-0 text-right text-[0.625rem] text-ink-soft">
                      {affinity.toFixed(3)}
                    </span>
                  </li>
                ))}
            </ul>

            {firedTerms.length > 0 ? (
              <>
                <h3 className="label-caps mt-4">Lexicon terms that fired</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {firedTerms[0].matched.map((term) => (
                    <li
                      key={term.term}
                      className="rounded-sm border border-strap/60 bg-strap/10 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[0.625rem] text-ink-soft"
                    >
                      {term.term} <span className="text-ink-faint">×{term.weight}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {Object.keys(sheet.determinations).length > 0 ? (
              <p className="mt-4 border-t border-rule pt-3 font-[family-name:var(--font-body)] text-xs text-ink-faint">
                Manual determinations override the lexicon:{" "}
                {Object.entries(sheet.determinations)
                  .map(([k, v]) => `${CLASS_BY_ID[k as keyof typeof CLASS_BY_ID]?.code ?? k} ${v}`)
                  .join(", ")}
                .
              </p>
            ) : null}
          </section>

          <SheetAnnotation sheet={sheet} />

          {siblings.length > 1 ? (
            <section className="sheet p-4" aria-labelledby="siblings-heading">
              <h2 id="siblings-heading" className="label-caps">
                Also in this volume
              </h2>
              <ul className="mt-2 space-y-1.5">
                {siblings
                  .filter((s) => s.id !== sheet.id)
                  .slice(0, 8)
                  .map((s) => (
                    <li key={s.id}>
                      <a
                        href={`/sheet/${s.id}`}
                        className="font-[family-name:var(--font-body)] text-sm underline decoration-rule underline-offset-4 hover:decoration-strap"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          {sheet.decisionNote ? (
            <section className="sheet p-4" aria-labelledby="why-heading">
              <h2 id="why-heading" className="label-caps flex items-center gap-1.5">
                <Quote className="h-3 w-3" aria-hidden />
                Sealed rationale
              </h2>
              <p className="marginalia mt-2">{sheet.decisionNote}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}