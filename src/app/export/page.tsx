import { cookies } from "next/headers";
import Link from "next/link";
import { listVolumes } from "@/lib/service";
import { EngineVersionBadge } from "@/components/engine-version-badge";
import { SOURCE_ATTRIBUTION } from "@/lib/sources/resolve";
import { Download, FileText } from "lucide-react";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * The export desk.
 *
 * Four formats, all generated from the persisted rows by the same renderer the
 * API uses, each with a real `Content-Disposition` so the browser downloads a
 * named file. Each volume lists what it would produce before you download it.
 */
export default async function ExportPage() {
  const scope = (await cookies()).get("hb_scope")?.value ?? "";
  const volumes = scope ? await listVolumes(scope, { includeRetired: true, limit: 50 }).catch(() => []) : [];

  const formats = [
    { id: "markdown", label: "Syllabus", detail: "A readable reading plan with the coverage plate, every sheet and its provenance." },
    { id: "bibtex", label: "BibTeX", detail: "One entry per mounted sheet, with unique keys, ready for a reference manager." },
    { id: "csv", label: "CSV", detail: "One row per sheet for a spreadsheet, properly quoted." },
    { id: "json", label: "Sealed JSON", detail: "The full report with factors, chain head and a digest, for re-verification." },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight sm:text-4xl">
          Export desk
        </h1>
        <p className="mt-2 max-w-3xl font-[family-name:var(--font-body)] text-base text-ink-soft">
          A reading volume is worth something only if it leaves the app. Every artifact below is
          rendered from the persisted rows on request, carries source attribution and a generation
          timestamp, and for JSON includes a digest of its own contents.
        </p>
        <EngineVersionBadge />
      </header>

      {volumes.length === 0 ? (
        <div className="mt-8 rounded-sm border border-rule bg-paper-deep/40 p-5">
          <p className="font-[family-name:var(--font-body)] text-sm text-ink-soft">
            No volumes in this session, so there is nothing to export yet.
          </p>
          <Link
            href="/#begin"
            className="mt-3 inline-block rounded-sm bg-field px-4 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright"
          >
            Open a volume
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-5">
          {volumes.map((volume) => (
            <li key={volume.id} className="sheet p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/volume/${volume.id}`}
                  className="font-[family-name:var(--font-bodoni)] text-xl underline decoration-rule underline-offset-4 hover:decoration-strap"
                >
                  {volume.name}
                </Link>
                <span className="figure text-[0.625rem] text-ink-faint">
                  {volume.sheetCount} sheets · {volume.status}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {formats.map((format) => (
                  <a
                    key={format.id}
                    href={`/api/export/${volume.id}?format=${format.id}`}
                    className="rounded-sm border border-rule p-3 transition-colors hover:border-strap"
                  >
                    <p className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink">
                      <Download className="h-3 w-3" aria-hidden />
                      {format.label}
                    </p>
                    <p className="mt-1 font-[family-name:var(--font-body)] text-xs leading-relaxed text-ink-faint">
                      {format.detail}
                    </p>
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 border-t border-rule pt-6">
        <h2 className="label-caps flex items-center gap-1.5">
          <FileText className="h-3 w-3" aria-hidden />
          What every export carries
        </h2>
        <ul className="mt-2 space-y-1.5 font-[family-name:var(--font-body)] text-sm text-ink-soft">
          <li>A generation timestamp, so two exports can be told apart.</li>
          <li>Attribution for every external source used.</li>
          <li>The volume&apos;s audit chain head, which can be replayed afterwards.</li>
          <li>A plain statement that coverage describes reading, not truth.</li>
        </ul>
        <ul className="mt-3 space-y-1 text-xs text-ink-faint">
          {SOURCE_ATTRIBUTION.map((attribution) => (
            <li key={attribution}>{attribution}</li>
          ))}
        </ul>
        <p className="mt-4 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
          endpoint /api/export/[id]?format=… · {site.repoUrl}
        </p>
      </section>
    </div>
  );
}