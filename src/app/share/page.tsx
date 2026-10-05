import Link from "next/link";
import { listVolumes } from "@/lib/service";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Shared volumes index.
 *
 * A share token is the only way in, so this page cannot enumerate anyone's
 * volumes. It lists the volumes in this session that currently have a public
 * link, which is genuinely useful and leaks nothing.
 */
export default async function ShareIndexPage() {
  const scope = (await cookies()).get("hb_scope")?.value ?? "";
  const volumes = scope
    ? (await listVolumes(scope, { includeRetired: true, limit: 100 }).catch(() => [])).filter(
        (volume) => volume.shareToken !== null,
      )
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight">
          Shared volumes
        </h1>
        <p className="mt-2 font-[family-name:var(--font-body)] text-base text-ink-soft">
          A shared volume is a read-only view. Whoever holds the link can read the sheets and the
          coverage report, and cannot change anything.
        </p>
      </header>

      {volumes.length === 0 ? (
        <div className="mt-6 rounded-sm border border-rule bg-paper-deep/40 p-5">
          <p className="font-[family-name:var(--font-body)] text-sm text-ink-soft">
            None of the volumes in this session have a public link. Open one and choose
            &ldquo;Share read-only&rdquo; to create one.
          </p>
          <Link
            href="/shelf"
            className="mt-3 inline-block rounded-sm bg-field px-4 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright"
          >
            Go to the shelf
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {volumes.map((volume) => (
            <li key={volume.id} className="sheet p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-[family-name:var(--font-bodoni)] text-xl">{volume.name}</span>
                <span className="figure text-[0.625rem] text-ink-faint">{volume.sheetCount} sheets</span>
              </div>
              <Link
                href={`/share/${volume.shareToken}`}
                className="mt-2 inline-block break-all figure text-[0.625rem] text-field underline decoration-rule underline-offset-4 hover:decoration-strap"
              >
                /share/{volume.shareToken}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 font-[family-name:var(--font-body)] text-xs text-ink-faint">
        <code className="figure">/share/&lt;token&gt;</code> is deliberately unguessable: 18 random
        bytes, base64url. There is no listing endpoint for other people&apos;s volumes.
      </p>
    </div>
  );
}