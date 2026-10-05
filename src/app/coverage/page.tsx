import { cookies } from "next/headers";
import Link from "next/link";
import { listVolumes, coverageFor, getWeights } from "@/lib/service";
import { CoveragePlate } from "@/components/coverage-plate";
import { WeightTuner } from "@/components/weight-tuner";
import { EngineVersionBadge } from "@/components/engine-version-badge";
import { RISK_CLASSES } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

/**
 * The coverage lab.
 *
 * The analysis route: run the engine over any volume this session owns, read the
 * itemised factors, and tilt the class weights. The plate is the same component
 * the volume page uses — there is no second implementation of the arithmetic.
 */
export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ volume?: string }>;
}) {
  const { volume: volumeId } = await searchParams;
  const scope = (await cookies()).get("hb_scope")?.value ?? "";
  const volumes = scope ? await listVolumes(scope, { includeRetired: true, limit: 100 }).catch(() => []) : [];
  const weights = scope ? await getWeights(scope).catch(() => null) : null;

  const selectedId = volumeId && volumes.some((v) => v.id === volumeId) ? volumeId : volumes[0]?.id;
  const result = selectedId ? await coverageFor(scope, selectedId).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight sm:text-4xl">
          Coverage lab
        </h1>
        <p className="mt-2 max-w-3xl font-[family-name:var(--font-body)] text-base text-ink-soft">
          The engine grades a volume against {RISK_CLASSES.length} AI-safety risk classes. It has no
          clock, no randomness and no network: the same mounted sheets always produce the same
          score, which is why the report can be sealed and later replayed.
        </p>
        <EngineVersionBadge />
      </header>

      {volumes.length === 0 ? (
        <div className="mt-8 rounded-sm border border-rule bg-paper-deep/40 p-5">
          <p className="font-[family-name:var(--font-body)] text-sm text-ink-soft">
            No volumes in this session yet, so there is nothing to grade. Open a volume and mount a
            few sheets.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/#begin"
              className="rounded-sm bg-field px-4 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright"
            >
              Open a volume
            </Link>
            <Link
              href="/discover"
              className="rounded-sm border border-ink px-4 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper"
            >
              Find papers
            </Link>
          </div>
        </div>
      ) : (
        <>
          <nav aria-label="Choose a volume" className="mt-6 flex flex-wrap gap-2">
            {volumes.map((volume) => {
              const active = volume.id === selectedId;
              return (
                <Link
                  key={volume.id}
                  href={`/coverage?volume=${volume.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-sm border px-3 py-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
                    active ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:border-field hover:text-field"
                  }`}
                >
                  {volume.name}
                </Link>
              );
            })}
          </nav>

          {result ? (
            <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="label-caps">{result.volume.name}</h2>
                  <p className="figure text-[0.625rem] text-ink-faint">
                    {result.sheets.length} sheets · chain{" "}
                    {result.report.referenceSeal.slice(0, 16)}…
                  </p>
                </div>

                <CoveragePlate
                  factors={result.report.factors}
                  score={result.report.score}
                  weights={weights ?? Object.fromEntries(RISK_CLASSES.map((c) => [c.id, 1]))}
                  engine={result.report.engine}
                />

                <section className="mt-8" aria-labelledby="factors-heading">
                  <h3 id="factors-heading" className="label-caps">
                    Itemised factors
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {result.report.factors
                      .filter((factor) => factor.sheets.length > 0)
                      .map((factor) => (
                        <li key={factor.classId} className="sheet p-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="determination text-base">{factor.label}</span>
                            <span className="figure text-[0.625rem] text-ink-faint">
                              load {factor.load.toFixed(3)} → coverage{" "}
                              {(factor.coverage * 100).toFixed(1)}%
                            </span>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {factor.sheets.map((contribution) => (
                              <li
                                key={contribution.sheetId}
                                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
                              >
                                <a
                                  href={`/sheet/${contribution.sheetId}`}
                                  className="min-w-0 flex-1 truncate font-[family-name:var(--font-body)] text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
                                >
                                  {contribution.title}
                                </a>
                                <span className="figure text-[0.625rem] text-ink-faint">
                                  affinity {contribution.affinity.toFixed(3)} × tier{" "}
                                  {contribution.tierWeight} × status {contribution.statusWeight} × cites{" "}
                                  {contribution.citationFactor} = {contribution.contribution.toFixed(4)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                  </ul>
                  {result.report.factors.every((f) => f.sheets.length === 0) ? (
                    <p className="mt-3 rounded-sm border border-rule bg-paper-deep/40 px-3 py-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
                      No sheet in this volume matches any class yet. Mount something and the factors
                      appear here.
                    </p>
                  ) : null}
                </section>
              </div>

              <aside className="space-y-6">
                <WeightTuner initialWeights={weights ?? Object.fromEntries(RISK_CLASSES.map((c) => [c.id, 1]))} />

                <section className="sheet p-4">
                  <h2 className="label-caps">How the score is built</h2>
                  <pre className="mt-2 overflow-x-auto scroll-thin font-[family-name:var(--font-mono)] text-[0.6875rem] leading-relaxed text-ink-soft">
{`affinity = 1 - e^-(lexicon weight matched)
evidence = tier x status x citationFactor
load(c)  = SUM affinity x evidence
coverage = 1 - e^-(load / saturation)
score    = SUM weight x coverage`}
                  </pre>
                  <p className="mt-2 figure text-[0.625rem] text-ink-faint">
                    input digest {result.report.evaluation.inputDigest.slice(0, 20)}… ·{" "}
                    {result.report.evaluation.sheetsWeighted} of{" "}
                    {result.report.evaluation.sheetsConsidered} sheets weighted
                  </p>
                </section>

                <section className="sheet p-4">
                  <h2 className="label-caps">Recommendation</h2>
                  <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-ink">
                    {result.report.recommendation.headline}
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-body)] text-sm text-ink-soft">
                    {result.report.recommendation.reason}
                  </p>
                  <Link
                    href={`/api/export/${result.volume.id}?format=markdown`}
                    className="mt-3 inline-block font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-field underline decoration-rule underline-offset-4 hover:decoration-strap"
                  >
                    Export this report as Markdown
                  </Link>
                </section>
              </aside>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}