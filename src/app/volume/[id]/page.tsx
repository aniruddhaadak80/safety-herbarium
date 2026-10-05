import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { coverageFor, getVolume, listSheets } from "@/lib/service";
import { errorEnvelope } from "@/lib/errors";
import { fetchDiscovery } from "@/lib/sources/resolve";
import { enrichCitations } from "@/lib/sources/openalex";
import { CoveragePlate } from "@/components/coverage-plate";
import { SheetFilters } from "@/components/sheet-filters";
import { MountControl } from "@/components/mount-control";
import { VolumeActions } from "@/components/volume-actions";
import { SheetDecision } from "@/components/sheet-decision";
import { Download, Share2, ShieldCheck, Archive } from "lucide-react";
import { GitHubMark } from "@/components/github-mark";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * A reading volume.
 *
 * The dynamic inspection route: the volume's own coverage plate, every mounted
 * sheet with its decision state, the recommendation for the largest gap, and the
 * controls to export, share, verify or retire the volume. Filters come from the
 * query string so a filtered view is a real URL.
 */
export default async function VolumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; class?: string; q?: string; sort?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const scope = (await cookies()).get("hb_scope")?.value ?? "";

  const volumeResult = await getVolume(scope, id).catch((error: unknown) => {
    const { status } = errorEnvelope(error);
    if (status === 404) notFound();
    throw error;
  });

  const sheets = await listSheets(scope, id, {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.class ? { classId: query.class as never } : {}),
    ...(query.q ? { query: query.q } : {}),
  });
  const allSheets = await listSheets(scope, id);
  const { report } = await coverageFor(scope, id);

  const discovery = await fetchDiscovery({ limit: 4 });
  const papers = await enrichCitations(discovery.papers, 2);
  const weights = Object.fromEntries(report.factors.map((f) => [f.classId, f.weight]));

  const gapFactor = report.factors.find((f) => f.classId === report.recommendation.primaryGap);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="label-caps">
        <Link href="/shelf" className="underline decoration-rule underline-offset-4 hover:text-field">
          Shelf
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-soft">{volumeResult.name}</span>
      </nav>

      <header className="mt-4 border-b border-ink pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-bodoni)] text-3xl leading-tight tracking-tight sm:text-4xl">
              {volumeResult.name}
            </h1>
            {volumeResult.intent ? (
              <p className="mt-2 max-w-2xl font-[family-name:var(--font-body)] text-base italic text-ink-soft">
                {volumeResult.intent}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="label-caps">Chain head</p>
            <p className="figure mt-0.5 text-[0.625rem] text-ink-faint">{volumeResult.seal}</p>
            <p className="figure mt-1 text-xs text-ink-soft">
              {allSheets.length} sheets · {volumeResult.readCount} read · {volumeResult.eventCount} events
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="label-stamp">{volumeResult.role}</span>
          {volumeResult.status === "retired" ? (
            <span className="label-stamp">retired · tombstoned</span>
          ) : null}
          {volumeResult.shareToken ? (
            <span className="label-stamp">shared</span>
          ) : null}
        </div>

        <VolumeActions volume={volumeResult} />
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label-caps">Mounted sheets</h2>
          </div>
          <Suspense fallback={<p className="mt-3 font-[family-name:var(--font-body)] text-sm text-ink-faint">Loading filters…</p>}>
            <SheetFilters sheets={sheets} volumeId={id} />
          </Suspense>

          {allSheets.length > 0 ? (
            <section className="mt-6" aria-labelledby="decisions-heading">
              <h2 id="decisions-heading" className="label-caps">
                Decisions
              </h2>
              <ul className="mt-3 space-y-3">
                {allSheets.slice(0, 8).map((sheet) => (
                  <li key={sheet.id}>
                    <SheetDecision sheet={sheet} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <CoveragePlate
            factors={report.factors}
            score={report.score}
            weights={weights}
            engine={report.engine}
          />

          <section className="sheet p-4" aria-labelledby="recommendation-heading">
            <h2 id="recommendation-heading" className="label-caps">
              Next read
            </h2>
            <p className="mt-2 font-[family-name:var(--font-body)] text-sm font-medium text-ink">
              {report.recommendation.headline}
            </p>
            <p className="mt-1 font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
              {report.recommendation.reason}
            </p>

            {gapFactor ? (
              <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
                This class carries weight{" "}
                <span className="figure">{gapFactor.weight.toFixed(3)}</span> of the score, and its
                evidence load is{" "}
                <span className="figure">{gapFactor.load.toFixed(3)}</span>.
              </p>
            ) : null}

            {report.recommendation.candidates.length > 0 ? (
              <ul className="mt-3 space-y-2 border-t border-rule pt-3">
                {report.recommendation.candidates.map((candidate) => (
                  <li key={candidate.sourceId}>
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-[family-name:var(--font-body)] text-sm underline decoration-rule underline-offset-4 hover:decoration-strap"
                    >
                      {candidate.title}
                    </a>
                    <p className="figure text-[0.625rem] text-ink-faint">{candidate.why}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-t border-rule pt-3 font-[family-name:var(--font-body)] text-sm text-ink-faint">
                No live candidates for this gap yet. Query the live index to pull some.
              </p>
            )}
          </section>

          <section className="sheet p-4" aria-labelledby="mount-heading">
            <h2 id="mount-heading" className="label-caps">
              Mount from the live index
            </h2>
            {discovery.provenance === "fallback" ? (
              <p className="mt-2 font-[family-name:var(--font-body)] text-xs text-fallback">
                arXiv unreachable; these come from a sealed snapshot and may be stale.
              </p>
            ) : null}
            <ul className="mt-3 space-y-3">
              {papers.map((paper) => (
                <li key={paper.sourceId}>
                  <MountControl
                    volumeId={id}
                    volumeName={volumeResult.name}
                    sourceKind="arxiv"
                    sourceId={paper.sourceId}
                    title={paper.title}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="mt-12 border-t border-rule pt-6">
        <h2 className="label-caps">Take it with you</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["markdown", "bibtex", "csv", "json"] as const).map((format) => (
            <a
              key={format}
              href={`/api/export/${id}?format=${format}`}
              className="inline-flex items-center gap-2 rounded-sm border border-ink px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {format}
            </a>
          ))}
          <Link
            href={`/verify/${id}`}
            className="inline-flex items-center gap-2 rounded-sm border border-ink px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Replay chain
          </Link>
          {volumeResult.shareToken ? (
            <Link
              href={`/share/${volumeResult.shareToken}`}
              className="inline-flex items-center gap-2 rounded-sm border border-ink px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden />
              Public link
            </Link>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-rule pt-4">
          <p className="figure text-xs text-ink-faint">
            input digest {report.evaluation.inputDigest.slice(0, 16)}… ·{" "}
            {report.evaluation.sheetsWeighted}/{report.evaluation.sheetsConsidered} sheets weighted
          </p>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
          >
            <GitHubMark className="h-3.5 w-3.5" />
            {site.repoSlug}
          </a>
        </div>

        <p className="mt-4 flex items-start gap-2 font-[family-name:var(--font-body)] text-xs leading-relaxed text-ink-faint">
          <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Retiring a volume keeps its rows and its audit chain so a seal you handed someone stays
          verifiable. Nothing here is erased.
        </p>
      </section>
    </div>
  );
}