"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { CLASS_BY_ID } from "@/lib/taxonomy";
import type { ClassId, Provenance, SourceRecord } from "@/lib/types";

/**
 * Search the live arXiv index by the reader's own words.
 *
 * Results are scored against the risk taxonomy, so each hit shows which open
 * class it speaks to. A fallback search is labelled as such: the reader is told
 * the index was unreachable rather than shown stale results as if they were live.
 */
export function SearchProbe() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; provenance: Provenance; papers: (SourceRecord & { matches: { classId: ClassId; affinity: number }[] })[]; note: string | null }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setState({ kind: "error", message: "Type at least two characters." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/discover/search?q=${encodeURIComponent(q)}&limit=8`);
      const payload = (await response.json()) as {
        provenance: Provenance;
        papers: (SourceRecord & { matches: { classId: ClassId; affinity: number }[] })[];
        note?: string | null;
        error?: { message: string };
      };
      if (!response.ok) {
        setState({ kind: "error", message: payload.error?.message ?? "Search failed." });
        return;
      }
      setState({
        kind: "done",
        provenance: payload.provenance,
        papers: payload.papers,
        note: payload.note ?? null,
      });
    } catch {
      setState({ kind: "error", message: "Network error. Nothing was searched." });
    }
  }

  return (
    <div className="sheet p-4">
      <form onSubmit={search}>
        <label htmlFor="search-q" className="label-caps">
          Query
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="search-q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="goal misgeneralization"
            maxLength={120}
            className="w-full rounded-sm border border-rule bg-paper px-3 py-2 font-[family-name:var(--font-body)] text-sm"
          />
          <button
            type="submit"
            disabled={state.kind === "loading"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-field px-3 py-2 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright disabled:opacity-60"
          >
            {state.kind === "loading" ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Search className="h-3 w-3" aria-hidden />
            )}
            Search
          </button>
        </div>
      </form>

      {state.kind === "error" ? (
        <p role="alert" className="mt-2 font-[family-name:var(--font-body)] text-sm text-stamp">
          {state.message}
        </p>
      ) : null}

      {state.kind === "done" ? (
        <div className="mt-3">
          <p
            className={`figure text-[0.625rem] uppercase tracking-[0.14em] ${
              state.provenance === "live" ? "text-field" : "text-fallback"
            }`}
          >
            {state.provenance === "live"
              ? `${state.papers.length} live results`
              : `${state.papers.length} snapshot results`}
          </p>
          {state.note ? (
            <p className="mt-1 font-[family-name:var(--font-body)] text-xs text-fallback">
              {state.note}
            </p>
          ) : null}

          {state.papers.length === 0 ? (
            <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
              Nothing matched. Try a broader phrase.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {state.papers.map((paper) => (
                <li key={paper.sourceId} className="border-b border-rule/60 pb-2 last:border-b-0">
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-[family-name:var(--font-body)] text-sm leading-snug underline decoration-rule underline-offset-4 hover:decoration-strap"
                  >
                    {paper.title}
                  </a>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 figure text-[0.625rem] text-ink-faint">
                    <span>{paper.sourceId}</span>
                    {paper.citations !== null ? <span>{paper.citations} cites</span> : null}
                    {paper.matches.map((match) => (
                      <span key={match.classId} className="text-label">
                        {CLASS_BY_ID[match.classId].code} {match.affinity.toFixed(2)}
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}