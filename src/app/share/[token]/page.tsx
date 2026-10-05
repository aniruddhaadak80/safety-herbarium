import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedVolume } from "@/lib/service";
import { errorEnvelope } from "@/lib/errors";
import { asShareToken } from "@/lib/validation";
import { gradeVolume } from "@/lib/engine";
import { CoveragePlate } from "@/components/coverage-plate";
import { defaultWeights } from "@/lib/taxonomy";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * A public, read-only view of one volume.
 *
 * Reachable only by share token, and deliberately inert: no decision controls, no
 * marginalia editor, nothing that mutates. A reader who was sent this link can
 * see what the volume contains and what the engine said about it, and cannot
 * change it.
 */
export default async function SharedVolumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = asShareToken(rawToken);

  const { volume, sheets } = await getSharedVolume(token).catch((error: unknown) => {
    const { status } = errorEnvelope(error);
    if (status === 404) notFound();
    throw error;
  });

  /**
   * Graded with uniform priors rather than the publisher's saved weights: this
   * route is not scoped to a session, so it cannot read private settings. Uniform
   * weights also make a shared link render identically for everyone who opens it,
   * which is the point of sharing a read-only view.
   */
  const weights = defaultWeights();
  const report = gradeVolume({
    volumeId: volume.id,
    role: volume.role,
    sheets: sheets.map((s) => ({
      id: s.id,
      title: s.title,
      abstract: s.abstract,
      status: s.status,
      tier: s.tier,
      citations: s.citations,
      determinations: s.determinations,
    })),
    weights,
    candidates: [],
    referenceSeal: volume.seal,
  });

  const factors = report.factors;
  const score = report.score;
  const referenceSeal = report.referenceSeal;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <p className="label-stamp">Read-only · shared volume</p>

      <header className="mt-4 border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl leading-tight tracking-tight sm:text-4xl">
          {volume.name}
        </h1>
        {volume.intent ? (
          <p className="mt-2 font-[family-name:var(--font-body)] text-base italic text-ink-soft">
            {volume.intent}
          </p>
        ) : null}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 figure text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
          <span className="text-strap">{volume.role}</span>
          <span>{sheets.length} sheets</span>
          <span>{volume.eventCount} sealed events</span>
          {volume.status === "retired" ? <span className="text-stamp">retired</span> : null}
        </p>
      </header>

      <CoveragePlate factors={factors} score={score} weights={weights} engine={report.engine} />

      <section className="mt-8" aria-labelledby="shared-sheets">
        <h2 id="shared-sheets" className="label-caps">
          Mounted sheets
        </h2>
        {sheets.length === 0 ? (
          <p className="mt-2 rounded-sm border border-rule bg-paper-deep/40 px-3 py-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
            This volume has no mounted sheets.
          </p>
        ) : (
          <ol className="mt-3 space-y-4">
            {sheets.map((sheet) => (
              <li key={sheet.id} className="sheet p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a
                    href={sheet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-[family-name:var(--font-bodoni)] text-lg leading-snug underline decoration-rule underline-offset-4 hover:decoration-strap"
                  >
                    {sheet.title}
                  </a>
                  <span className="figure text-[0.625rem] text-ink-faint">{sheet.accession}</span>
                </div>
                <p className="mt-1 figure text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                  {sheet.status}
                  {sheet.decision ? ` · ${sheet.decision}` : ""} · {sheet.tier}
                  {sheet.citations > 0 ? ` · ${sheet.citations} cites` : ""}
                </p>
                {sheet.decisionNote ? (
                  <p className="marginalia mt-2 font-[family-name:var(--font-body)] text-sm">
                    {sheet.decisionNote}
                  </p>
                ) : null}
                {sheet.marginalia ? (
                  <p className="mt-2 font-[family-name:var(--font-body)] text-sm italic text-ink-soft">
                    {sheet.marginalia}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="mt-10 border-t border-rule pt-4">
        <p className="break-all figure text-[0.625rem] text-ink-faint">
          chain head {referenceSeal}
        </p>
        <p className="mt-2 font-[family-name:var(--font-body)] text-xs leading-relaxed text-ink-faint">
          A reading aid, not a safety assessment. Coverage describes what this volume read, not what
          is true about AI systems.
        </p>
        <a
          href={site.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
        >
          {site.repoUrl}
        </a>
        <Link
          href="/"
          className="mt-3 ml-4 inline-block font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-field underline decoration-rule underline-offset-4 hover:decoration-strap"
        >
          Build your own volume
        </Link>
      </footer>
    </div>
  );
}