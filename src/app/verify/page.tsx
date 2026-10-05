import { cookies } from "next/headers";
import Link from "next/link";
import { listVolumes, verifyVolume } from "@/lib/service";
import { GENESIS_SEAL } from "@/lib/canonical";

export const dynamic = "force-dynamic";

/**
 * The verify desk.
 *
 * Every volume this session owns, with its chain replayed on the server. A failure
 * names the event where the chain broke rather than just reporting that it did,
 * because "your seal is invalid" is not actionable.
 */
export default async function VerifyPage() {
  const scope = (await cookies()).get("hb_scope")?.value ?? "";
  const volumes = scope
    ? await listVolumes(scope, { includeRetired: true, limit: 50 }).catch(() => [])
    : [];

  const reports = await Promise.all(
    volumes.map(async (volume) => {
      const report = await verifyVolume(scope, volume.id).catch(() => null);
      return { volume, report };
    }),
  );

  const broken = reports.filter((entry) => entry.report && !entry.report.ok).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight sm:text-4xl">
          Verify
        </h1>
        <p className="mt-2 max-w-3xl font-[family-name:var(--font-body)] text-base text-ink-soft">
          Every mutation appends a sealed event to its volume&apos;s chain:{" "}
          <code className="figure text-sm">
            seal = SHA-384( prevSeal || canonicalJson(event) )
          </code>
          . Replaying recomputes every seal from the stored events and reports the first broken
          link. Canonical JSON sorts keys at every depth, so a replay does not depend on the order
          anything was written in.
        </p>
        <p className="mt-3 figure text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
          genesis {GENESIS_SEAL.slice(0, 32)}…
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="mt-8 rounded-sm border border-rule bg-paper-deep/40 p-5">
          <p className="font-[family-name:var(--font-body)] text-sm text-ink-soft">
            No volumes in this session, so there is no chain to replay yet.
          </p>
          <Link
            href="/#begin"
            className="mt-3 inline-block rounded-sm bg-field px-4 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright"
          >
            Open a volume
          </Link>
        </div>
      ) : (
        <>
          <p
            role="status"
            className={`mt-6 inline-flex items-center gap-2 rounded-sm border px-3 py-2 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
              broken === 0
                ? "border-field/50 bg-field/8 text-field"
                : "border-stamp/50 bg-stamp/8 text-stamp"
            }`}
          >
            {broken === 0
              ? `${reports.length} chains replayed, none broken`
              : `${broken} of ${reports.length} chains are broken`}
          </p>

          <ul className="mt-4 space-y-4">
            {reports.map(({ volume, report }) => (
              <li key={volume.id} className="sheet p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/volume/${volume.id}`}
                    className="font-[family-name:var(--font-bodoni)] text-lg underline decoration-rule underline-offset-4 hover:decoration-strap"
                  >
                    {volume.name}
                  </Link>
                  <span className="figure text-[0.625rem] text-ink-faint">
                    {report ? `${report.events} events` : "unavailable"}
                  </span>
                </div>

                {report ? (
                  <>
                    <p
                      className={`mt-2 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
                        report.ok ? "text-field" : "text-stamp"
                      }`}
                    >
                      {report.ok
                        ? "chain intact"
                        : `broken at event ${report.brokenAtSeq}: ${report.reason}`}
                    </p>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 figure text-[0.625rem] text-ink-faint sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt>recomputed head</dt>
                        <dd className="min-w-0 break-all text-ink-soft">{report.headSeal}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt>stored head</dt>
                        <dd className="min-w-0 break-all text-ink-soft">{report.headStored}</dd>
                      </div>
                    </dl>
                    <p
                      className={`mt-1 figure text-[0.625rem] uppercase tracking-[0.14em] ${
                        report.headSeal === report.headStored ? "text-field" : "text-stamp"
                      }`}
                    >
                      {report.headSeal === report.headStored
                        ? "stored head matches the recomputed chain"
                        : "stored head does not match"}
                    </p>
                    <Link
                      href={`/verify/${volume.id}`}
                      className="mt-2 inline-block font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-field underline decoration-rule underline-offset-4 hover:decoration-strap"
                    >
                      Event-by-event replay
                    </Link>
                  </>
                ) : (
                  <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-stamp">
                    This chain could not be replayed right now.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}