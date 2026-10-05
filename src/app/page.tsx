import { cookies } from "next/headers";
import { listVolumes } from "@/lib/service";
import { RISK_CLASSES } from "@/lib/taxonomy";
import { fetchDiscovery } from "@/lib/sources/resolve";
import { enrichCitations } from "@/lib/sources/openalex";
import { BOOKSHELF } from "@/lib/sources/bookshelf";
import { MountControl } from "@/components/mount-control";
import { ArrowRight, BookOpen } from "lucide-react";
import { GitHubMark } from "@/components/github-mark";
import Link from "next/link";
import { site } from "@/lib/site";
import { Disclosure } from "@/components/disclosure";
import { NewVolumeForm } from "@/components/new-volume-form";
import { EngineReadout } from "@/components/engine-readout";

export const dynamic = "force-dynamic";

/**
 * The entry sheet.
 *
 * A visitor should be able to understand the product and start using it without
 * an account: see the live arXiv feed, mount the first sheet into a new volume,
 * and watch the coverage engine produce a number. So the first screen offers the
 * real primary action, not a marketing paragraph with a dead button.
 */
export default async function HomePage() {
  const cookieStore = await cookies();
  const scopeCookie = cookieStore.get("hb_scope")?.value;
  // The proxy sets the cookie before this renders; if it somehow did not, the
  // page still renders from live data rather than failing.
  const scope = scopeCookie ?? "";
  const volumes = scope ? await listVolumes(scope, { limit: 5 }).catch(() => []) : [];
  const discovery = await fetchDiscovery({ limit: 6 });
  const papers = await enrichCitations(discovery.papers, 4);

  const primaryGap = RISK_CLASSES[0];
  const demo = volumes[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <section className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <div>
          <p className="label-caps">Accession · open catalogue · {RISK_CLASSES.length} taxa</p>
          <h1 className="mt-3 font-[family-name:var(--font-bodoni)] text-4xl leading-[1.08] tracking-tight sm:text-5xl">
            Mount the AI-safety literature.
            <span className="block italic text-field">See what you are actually missing.</span>
          </h1>
          <p className="mt-5 max-w-xl font-[family-name:var(--font-body)] text-lg leading-relaxed text-ink-soft">
            Pull live arXiv papers and open-access safety textbooks, mount them into a reading
            volume, and a deterministic engine grades which of the ten risk classes your volume
            covers — with every factor itemised and every decision sealed into a hash chain you can
            replay.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="#begin"
              className="inline-flex items-center gap-2 rounded-sm bg-field px-5 py-3 font-[family-name:var(--font-mono)] text-sm uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright"
            >
              Start a volume
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-sm border border-ink px-5 py-3 font-[family-name:var(--font-mono)] text-sm uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper"
            >
              <GitHubMark className="h-4 w-4" />
              Star on GitHub
            </a>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-6 sm:grid-cols-4">
            {[
              { term: "Live source", detail: discovery.provenance === "live" ? "arXiv, now" : "sealed snapshot" },
              { term: "Open-access shelf", detail: `${BOOKSHELF.length} verified PDFs` },
              { term: "Engine", detail: "herbarium-grade/1.0.0" },
              { term: "Account needed", detail: "None" },
            ].map((item) => (
              <div key={item.term}>
                <dt className="label-caps">{item.term}</dt>
                <dd className="mt-1 font-[family-name:var(--font-body)] text-sm text-ink">{item.detail}</dd>
              </div>
            ))}
          </dl>

          {discovery.provenance === "fallback" ? (
            <p
              role="status"
              className="mt-6 rounded-sm border border-caution/50 bg-caution/8 px-3 py-2 font-[family-name:var(--font-body)] text-sm text-caution"
            >
              arXiv was unreachable, so the live feed below is a sealed offline snapshot taken{" "}
              {discovery.fetchedAt}. It is not current.
            </p>
          ) : null}

          {demo ? (
            <div className="mt-8 rounded-sm border border-paper-edge bg-paper-deep/50 p-4">
              <p className="label-caps">Your most recent volume</p>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/volume/${demo.id}`}
                  className="font-[family-name:var(--font-bodoni)] text-xl underline decoration-rule underline-offset-4 hover:decoration-strap"
                >
                  {demo.name}
                </Link>
                <span className="figure text-xs text-ink-faint">
                  {demo.sheetCount} sheets · {demo.readCount} read · {demo.eventCount} events
                </span>
              </div>
              <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
                Chain head{" "}
                <span className="figure text-xs">{demo.seal.slice(0, 24)}…</span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="lg:pt-6">
          <EngineReadout
            primaryGap={primaryGap}
            score={demo ? undefined : 0}
            referenceSeal={demo?.seal ?? null}
          />
        </div>
      </section>

      <section id="begin" className="mt-16 scroll-mt-20 border-t border-ink pt-8">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="font-[family-name:var(--font-bodoni)] text-2xl tracking-tight">
              Open a volume, then mount something into it
            </h2>
            <p className="mt-2 max-w-md font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
              A volume is a reading programme with an intent. The engine grades it against ten
              risk classes, so an under-covered class shows up as a gap with a recommendation
              rather than as a vague feeling of not having read enough.
            </p>
            <div className="mt-5">
              <NewVolumeForm />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="label-caps">
                {discovery.provenance === "live" ? "Live from arXiv" : "Sealed offline snapshot"}
              </h3>
              <Link
                href="/discover"
                className="figure text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
              >
                full index →
              </Link>
            </div>

            <ul className="mt-3 space-y-3">
              {papers.map((paper) => (
                <li key={paper.sourceId}>
                  <MountControl
                    volumeId={demo?.id ?? ""}
                    volumeName={demo?.name ?? "a volume"}
                    sourceKind="arxiv"
                    sourceId={paper.sourceId}
                    title={paper.title}
                  />
                </li>
              ))}
            </ul>

            {volumes.length === 0 ? (
              <p className="mt-4 rounded-sm border border-rule bg-paper-deep/40 px-3 py-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
                Open a volume above and these mount buttons will write into it.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-16 border-t border-rule pt-8">
        <Disclosure summary="What the engine actually measures">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="label-caps">Affinity</p>
              <p className="mt-1.5 font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
                Each sheet&apos;s title and abstract are matched against a weighted lexicon of ten risk
                classes. A saturating sum turns matched weight into an affinity between 0 and 1, so
                one paper can be relevant to two classes without dominating either.
              </p>
            </div>
            <div>
              <p className="label-caps">Evidence weight</p>
              <p className="mt-1.5 font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
                Tier (monograph, standard, survey, empirical, theoretical, position) times reading
                status (a read sheet counts fully, a queued sheet counts 0.2, a rejected one counts
                nothing) times a citation factor capped at +40%.
              </p>
            </div>
            <div>
              <p className="label-caps">Coverage</p>
              <p className="mt-1.5 font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
                Per class, evidence load saturates into a coverage figure, and the volume score is
                the weighted mean of the ten. Below 35% a class is reported as an open gap. No
                clock, no randomness, no network: identical inputs return identical output.
              </p>
            </div>
          </div>
        </Disclosure>
      </section>

      <section className="mt-10 border-t border-rule pt-8">
        <h2 className="label-caps">Open-access shelf</h2>
        <p className="mt-2 max-w-2xl font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
          Full-text documents their publishers placed in the public, each with its licence recorded
          and its PDF checked live. Nothing is mirrored here:{" "}
          <span className="determination">
            books with no free edition are deliberately absent rather than copied
          </span>
          .
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {BOOKSHELF.slice(0, 4).map((book) => (
            <li key={book.key} className="sheet p-3">
              <p className="flex items-baseline gap-2">
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-strap" aria-hidden />
                <a
                  href={book.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-[family-name:var(--font-body)] text-sm leading-snug underline decoration-rule underline-offset-4 hover:decoration-strap"
                >
                  {book.title}
                </a>
              </p>
              <p className="mt-1.5 label-caps">
                {book.kind} · {book.publishedAt.slice(0, 4)} · {book.license}
              </p>
            </li>
          ))}
        </ul>
        <Link
          href="/discover"
          className="mt-4 inline-block figure text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
        >
          All {BOOKSHELF.length} titles, with live link verification →
        </Link>
      </section>
    </div>
  );
}