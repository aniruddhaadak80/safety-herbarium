import { cookies } from "next/headers";
import Link from "next/link";
import { listVolumes } from "@/lib/service";
import { NewVolumeForm } from "@/components/new-volume-form";
import { RISK_CLASSES } from "@/lib/taxonomy";
import { EngineVersionBadge } from "@/components/engine-version-badge";

export const dynamic = "force-dynamic";

/**
 * The shelf: every reading volume this session owns.
 *
 * A working list, not a dashboard: each row links to the volume, carries the
 * persisted counts and the chain head, and states plainly whether it is retired.
 * The active filter (all vs retired) is in the URL.
 */
export default async function ShelfPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const scope = (await cookies()).get("hb_scope")?.value ?? "";
  const includeRetired = filter === "retired";
  const volumes = scope ? await listVolumes(scope, { includeRetired, limit: 100 }).catch(() => []) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight sm:text-4xl">
          The shelf
        </h1>
        <p className="mt-2 max-w-2xl font-[family-name:var(--font-body)] text-base text-ink-soft">
          Reading volumes belong to this browser session. There is no account: an anonymous
          HTTP-only cookie holds an unguessable token, and every read and write is filtered by it.
        </p>
        <EngineVersionBadge />
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="volumes-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="volumes-heading" className="label-caps">
              Volumes
            </h2>
            <nav aria-label="Filter" className="flex gap-2">
              <Link
                href="/shelf"
                aria-current={!includeRetired ? "page" : undefined}
                className={`rounded-sm border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
                  !includeRetired ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"
                }`}
              >
                Active
              </Link>
              <Link
                href="/shelf?filter=retired"
                aria-current={includeRetired ? "page" : undefined}
                className={`rounded-sm border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
                  includeRetired ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"
                }`}
              >
                Retired
              </Link>
            </nav>
          </div>

          {volumes.length === 0 ? (
            <div className="mt-4 rounded-sm border border-rule bg-paper-deep/40 p-5">
              <p className="font-[family-name:var(--font-body)] text-sm text-ink-soft">
                {includeRetired
                  ? "No retired volumes in this session."
                  : "This session owns no volumes yet. Open one and mount a paper to see the coverage engine do real work."}
              </p>
              <Link
                href="/discover"
                className="mt-3 inline-block rounded-sm bg-field px-4 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright"
              >
                Find something to read
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {volumes.map((volume) => (
                <li key={volume.id}>
                  <Link
                    href={`/volume/${volume.id}`}
                    className="sheet block p-4 transition-colors hover:border-strap"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-[family-name:var(--font-bodoni)] text-xl tracking-tight">
                        {volume.name}
                      </span>
                      <span className="figure text-[0.625rem] text-ink-faint">
                        {volume.sheetCount} sheets · {volume.readCount} read · {volume.eventCount}{" "}
                        events
                      </span>
                    </div>
                    {volume.intent ? (
                      <p className="mt-1 font-[family-name:var(--font-body)] text-sm italic text-ink-soft">
                        {volume.intent}
                      </p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 figure text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                      <span className="text-strap">{volume.role}</span>
                      <span className="text-label">{volume.status}</span>
                      {volume.shareToken ? <span className="text-field">shared</span> : null}
                      <span>opened {volume.createdAt.slice(0, 10)}</span>
                    </p>
                    <p className="mt-1 break-all figure text-[0.625rem] text-ink-faint">
                      {volume.seal}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-5">
          <NewVolumeForm />
          <section className="sheet p-4">
            <h2 className="label-caps">What gets measured</h2>
            <ul className="mt-2 space-y-1.5">
              {RISK_CLASSES.map((c) => (
                <li key={c.id} className="flex gap-2 font-[family-name:var(--font-body)] text-sm">
                  <span className="figure shrink-0 text-[0.625rem] text-strap">{c.code}</span>
                  <span className="text-ink-soft">{c.label}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}