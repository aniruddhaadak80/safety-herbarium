"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { VerificationResult } from "@/lib/sources/bookshelf";

/**
 * The result of probing every open-access PDF on the catalogue.
 *
 * Rendered as a real report: status code, content type and latency per title,
 * so a slow or redirected host is visible rather than just a green tick.
 */
export function BookshelfVerification({
  verification,
}: {
  verification: {
    checkedAt: string;
    total: number;
    reachable: number;
    results: VerificationResult[];
  };
}) {
  const [open, setOpen] = useState(false);
  const allGood = verification.reachable === verification.total;

  return (
    <section className="mt-4 rounded-sm border border-rule bg-paper-deep/40 p-3" aria-labelledby="verify-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="verify-heading" className="label-caps">
          Link check
        </h3>
        <p
          className={`figure text-[0.625rem] uppercase tracking-[0.14em] ${allGood ? "text-field" : "text-caution"}`}
          role="status"
        >
          {verification.reachable}/{verification.total} reachable
        </p>
      </div>
      <p className="mt-0.5 figure text-[0.625rem] text-ink-faint">{verification.checkedAt}</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
      >
        {open ? "Hide detail" : "Show per-title detail"}
      </button>

      {open ? (
        <ul className="mt-2 space-y-1.5">
          {verification.results.map((result) => (
            <li key={result.key} className="flex flex-wrap items-center gap-2 text-xs">
              {result.reachable ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-field" aria-hidden />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-stamp" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-body)] text-ink-soft">
                {result.title}
              </span>
              <span className="figure text-[0.625rem] text-ink-faint">
                {result.status ?? "—"} · {result.latencyMs}ms
                {result.contentType ? ` · ${result.contentType.split(";")[0]}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Small spinner used while a live check runs. */
export function Verifying() {
  return (
    <span className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      checking
    </span>
  );
}