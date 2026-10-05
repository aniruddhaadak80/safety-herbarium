import { cookies } from "next/headers";
import Link from "next/link";
import { listVolumes } from "@/lib/service";
import { fetchDiscovery } from "@/lib/sources/resolve";
import { enrichCitations } from "@/lib/sources/openalex";
import { BOOKSHELF, verifyBookshelf } from "@/lib/sources/bookshelf";
import { SNAPSHOT } from "@/lib/sources/snapshot";
import { RISK_CLASSES, affinitiesFor } from "@/lib/taxonomy";
import { MountControl } from "@/components/mount-control";
import { SearchProbe } from "@/components/search-probe";
import { BookshelfVerification } from "@/components/bookshelf-verification";
import { arxivAttribution, openAlexAttribution } from "@/lib/sources/attribution";

export const dynamic = "force-dynamic";

/**
 * Discovery: two live sources and one curated shelf.
 *
 * The arXiv feed is normalised and enrichment from OpenAlex is joined in. If
 * arXiv is unreachable the sealed snapshot answers and says so in words, not just
 * in a flag. The open-access bookshelf carries its licences and can verify every
 * PDF's reachability live.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; verify?: string }>;
}) {
  const { sort, verify } = await searchParams;
  const scope = (await cookies()).get("hb_scope")?.value ?? "";
  const volumes = scope ? await listVolumes(scope, { limit: 10 }).catch(() => []) : [];
  const discovery = await fetchDiscovery({
    limit: 12,
    sort: sort === "recent" ? "recent" : "relevance",
  });
  const papers = await enrichCitations(discovery.papers, 8);

  const books = BOOKSHELF.map((entry) => ({
    ...entry,
    matches: Object.entries(affinitiesFor({ title: entry.title, abstract: entry.summary }))
      .filter(([, value]) => value > 0.05)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([classId, affinity]) => ({ classId, affinity })),
  }));

  const verification = verify === "1" ? await verifyBookshelf() : null;
  const target = volumes[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight sm:text-4xl">
          Discovery
        </h1>
        <p className="mt-2 max-w-3xl font-[family-name:var(--font-body)] text-base text-ink-soft">
          Live arXiv papers across the field&apos;s load-bearing phrases, enriched with real citation
          counts from OpenAlex. Below them, twelve open-access documents their publishers placed in
          the public — textbooks, standards, reports and primers.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href="/discover?sort=relevance"
            aria-current={sort !== "recent" ? "page" : undefined}
            className={`rounded-sm border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
              sort !== "recent" ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"
            }`}
          >
            Most relevant
          </Link>
          <Link
            href="/discover?sort=recent"
            aria-current={sort === "recent" ? "page" : undefined}
            className={`rounded-sm border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
              sort === "recent" ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"
            }`}
          >
            Most recent
          </Link>
          <Link
            href="/discover?verify=1"
            aria-current={verify === "1" ? "page" : undefined}
            className={`rounded-sm border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
              verify === "1" ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"
            }`}
          >
            Verify shelf links
          </Link>
        </div>

        <p
          role="status"
          className={`mt-4 inline-flex flex-wrap items-center gap-2 rounded-sm border px-3 py-2 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
            discovery.provenance === "live"
              ? "border-field/50 bg-field/8 text-field"
              : "border-fallback/50 bg-fallback/8 text-fallback"
          }`}
        >
          {discovery.provenance === "live" ? (
            <>
              <span className="h-2 w-2 bg-field" aria-hidden />
              Live from arXiv · fetched {discovery.fetchedAt}
            </>
          ) : (
            <>
              <span className="h-2 w-2 bg-fallback" aria-hidden />
              Sealed snapshot from {SNAPSHOT.sealedAt} · not current
            </>
          )}
        </p>

        {discovery.note ? (
          <p className="mt-2 max-w-3xl font-[family-name:var(--font-body)] text-sm text-fallback">
            {discovery.note}
          </p>
        ) : null}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="papers-heading">
          <h2 id="papers-heading" className="label-caps">
            arXiv index
          </h2>
          <p className="mt-1 figure text-[0.625rem] text-ink-faint">{arxivAttribution}</p>

          <ul className="mt-4 space-y-4">
            {papers.map((paper) => (
              <li key={paper.sourceId} className="sheet p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-[family-name:var(--font-bodoni)] text-lg leading-snug underline decoration-rule underline-offset-4 hover:decoration-strap"
                  >
                    {paper.title}
                  </a>
                  <span className="figure shrink-0 text-[0.625rem] text-ink-faint">
                    {paper.sourceId}
                  </span>
                </div>

                <p className="mt-1 font-[family-name:var(--font-body)] text-xs text-ink-faint">
                  {paper.authors.slice(0, 6).join(", ")}
                  {paper.authors.length > 6 ? " et al." : ""}
                </p>

                <p className="mt-2 line-clamp-3 font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
                  {paper.abstract}
                </p>

                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 figure text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                  {paper.publishedAt ? <span>{paper.publishedAt.slice(0, 10)}</span> : null}
                  <span>{paper.hostLabel}</span>
                  <span className="text-strap">{paper.tier}</span>
                  <span className={paper.citations === null ? "text-caution" : ""}>
                    {paper.citations === null ? "cites unavailable" : `${paper.citations} cites`}
                  </span>
                  {paper.license ? <span>{paper.license}</span> : null}
                </p>

                <div className="mt-3">
                  {target ? (
                    <MountControl
                      volumeId={target.id}
                      volumeName={target.name}
                      sourceKind="arxiv"
                      sourceId={paper.sourceId}
                      title={paper.title}
                    />
                  ) : (
                    <p className="font-[family-name:var(--font-body)] text-sm text-ink-soft">
                      <Link
                        href="/#begin"
                        className="underline decoration-rule underline-offset-4 hover:text-field"
                      >
                        Open a volume
                      </Link>{" "}
                      to mount this paper.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 font-[family-name:var(--font-body)] text-xs text-ink-faint">
            Citation counts: {openAlexAttribution}
          </p>
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="search-heading">
            <h2 id="search-heading" className="label-caps">
              Search the live index
            </h2>
            <SearchProbe />
          </section>

          <section aria-labelledby="shelf-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="shelf-heading" className="label-caps">
                Open-access bookshelf
              </h2>
              <span className="figure text-[0.625rem] text-ink-faint">{books.length} titles</span>
            </div>
            <p className="mt-1 font-[family-name:var(--font-body)] text-xs text-ink-faint">
              Full text, publisher-hosted, licence recorded. Nothing mirrored here.
            </p>

            <ul className="mt-3 space-y-3">
              {books.map((book) => (
                <li key={book.key} className="sheet p-3">
                  <a
                    href={book.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-[family-name:var(--font-body)] text-sm leading-snug underline decoration-rule underline-offset-4 hover:decoration-strap"
                  >
                    {book.title}
                  </a>
                  <p className="mt-1 figure text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                    {book.kind} · {book.publishedAt.slice(0, 4)} · {book.license}
                  </p>
                  {book.matches.length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {book.matches.map((match) => (
                        <span
                          key={match.classId}
                          className="rounded-sm border border-strap/60 px-1.5 py-0.5 figure text-[0.625rem] text-ink-soft"
                        >
                          {RISK_CLASSES.find((c) => c.id === match.classId)?.code} {match.affinity.toFixed(2)}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {target ? (
                    <div className="mt-2">
                      <MountControl
                        volumeId={target.id}
                        volumeName={target.name}
                        sourceKind="book"
                        sourceId={book.key}
                        title={book.title}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {verification ? <BookshelfVerification verification={verification} /> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}