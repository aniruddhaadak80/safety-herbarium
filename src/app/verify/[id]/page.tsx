import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVolume, getAudit, verifyVolume } from "@/lib/service";
import { errorEnvelope } from "@/lib/errors";
import { replayChain } from "@/lib/canonical";

export const dynamic = "force-dynamic";

/**
 * Event-by-event replay for one volume.
 *
 * Every event is listed with its previous seal, its stored seal and the seal the
 * replay just recomputed. A single disagreement is highlighted with its sequence
 * number, which is the thing a reader needs in order to distrust the record.
 */
export default async function VerifyVolumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = (await cookies()).get("hb_scope")?.value ?? "";

  const volume = await getVolume(scope, id).catch((error: unknown) => {
    const { status } = errorEnvelope(error);
    if (status === 404) notFound();
    throw error;
  });

  const events = await getAudit(scope, id);
  const report = await verifyVolume(scope, id);
  const replay = replayChain(events);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="label-caps">
        <Link href="/verify" className="underline decoration-rule underline-offset-4 hover:text-field">
          Verify
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-soft">{volume.name}</span>
      </nav>

      <header className="mt-4 border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight">
          {volume.name}
        </h1>
        <p
          role="status"
          className={`mt-3 inline-flex items-center gap-2 rounded-sm border px-3 py-2 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] ${
            report.ok
              ? "border-field/50 bg-field/8 text-field"
              : "border-stamp/50 bg-stamp/8 text-stamp"
          }`}
        >
          {report.ok
            ? `${report.events} events, no broken link`
            : `broken at event ${report.brokenAtSeq}: ${report.reason}`}
        </p>
      </header>

      {events.length === 0 ? (
        <p className="mt-6 rounded-sm border border-rule bg-paper-deep/40 px-3 py-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
          This volume has no events yet.
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {events.map((event, index) => {
            const recomputed = replay.ok || (replay.brokenAtSeq !== null && event.seq < replay.brokenAtSeq);
            const isBreak = event.seq === replay.brokenAtSeq;
            return (
              <li
                key={event.seq}
                className={`sheet p-3 ${
                  isBreak ? "border-stamp" : event.seq === events.length ? "border-field/60" : ""
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="figure text-sm">
                    #{event.seq} {event.eventType}
                  </span>
                  <span className="figure text-[0.625rem] text-ink-faint">{event.createdAt}</span>
                </div>

                <pre className="mt-2 max-h-48 overflow-auto scroll-thin rounded-sm border border-rule bg-paper-deep/40 p-2 font-[family-name:var(--font-mono)] text-[0.625rem] leading-relaxed text-ink-soft">
{JSON.stringify(event.payload, null, 2)}
                </pre>

                <dl className="mt-2 space-y-1 figure text-[0.625rem]">
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-ink-faint">prev</dt>
                    <dd className="min-w-0 break-all text-ink-soft">{event.prevSeal}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-ink-faint">seal</dt>
                    <dd className="min-w-0 break-all text-ink-soft">{event.seal}</dd>
                  </div>
                </dl>

                {isBreak ? (
                  <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-stamp">
                    This event is the first broken link. Everything after it cannot be trusted.
                  </p>
                ) : recomputed ? (
                  <p className="mt-1 figure text-[0.625rem] uppercase tracking-[0.14em] text-field">
                    recomputed seal matches
                  </p>
                ) : (
                  <p className="mt-1 figure text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                    not reached in this replay
                  </p>
                )}

                {index === events.length - 1 ? (
                  <p className="mt-1 figure text-[0.625rem] uppercase tracking-[0.14em] text-field">
                    chain head
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}