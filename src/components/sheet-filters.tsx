"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RISK_CLASSES } from "@/lib/taxonomy";
import type { Sheet } from "@/lib/types";

/**
 * The mounted sheet list, with the filters and sort held in the URL so a view can
 * be shared and survives a refresh. Changing a control writes to the query string
 * and lets the server re-render from the new state; there is no local mirror of
 * the list to fall out of date.
 */
export function SheetFilters({
  sheets,
  volumeId,
}: {
  sheets: readonly Sheet[];
  volumeId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const classId = params.get("class") ?? "";
  const sort = params.get("sort") ?? "mounted";
  const query = params.get("q") ?? "";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/volume/${volumeId}?${next.toString()}`, { scroll: false });
  };

  const ordered = useMemo(() => {
    const copy = [...sheets];
    switch (sort) {
      case "title":
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case "citations":
        return copy.sort((a, b) => b.citations - a.citations);
      case "accession":
        return copy.sort((a, b) => a.accession.localeCompare(b.accession));
      default:
        return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
  }, [sheets, sort]);

  return (
    <div className="sheet p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="filter-q" className="label-caps">
            Search titles
          </label>
          <input
            id="filter-q"
            defaultValue={query}
            onBlur={(event) => setParam("q", event.target.value.trim())}
            onKeyDown={(event) => {
              if (event.key === "Enter") setParam("q", (event.target as HTMLInputElement).value.trim());
            }}
            placeholder="alignment faking"
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-2.5 py-1.5 font-[family-name:var(--font-body)] text-sm"
          />
        </div>

        <div>
          <label htmlFor="filter-status" className="label-caps">
            Reading status
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(event) => setParam("status", event.target.value)}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-2.5 py-1.5 font-[family-name:var(--font-body)] text-sm"
          >
            <option value="">All</option>
            {["queued", "reading", "read", "parked", "rejected"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-class" className="label-caps">
            Risk class
          </label>
          <select
            id="filter-class"
            value={classId}
            onChange={(event) => setParam("class", event.target.value)}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-2.5 py-1.5 font-[family-name:var(--font-body)] text-sm"
          >
            <option value="">All</option>
            {RISK_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-sort" className="label-caps">
            Sort
          </label>
          <select
            id="filter-sort"
            value={sort}
            onChange={(event) => setParam("sort", event.target.value)}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-2.5 py-1.5 font-[family-name:var(--font-body)] text-sm"
          >
            <option value="mounted">Mounted order</option>
            <option value="title">Title</option>
            <option value="citations">Citations</option>
            <option value="accession">Accession</option>
          </select>
        </div>
      </div>

      <p className="mt-3 figure text-xs text-ink-faint" role="status">
        {ordered.length} {ordered.length === 1 ? "sheet" : "sheets"}
        {status || classId || query ? " (filtered)" : ""} · filters live in the URL
      </p>

      {ordered.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {ordered.map((sheet) => (
            <li key={sheet.id} className="border-b border-rule/60 pb-2 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <a
                  href={`/sheet/${sheet.id}`}
                  className="font-[family-name:var(--font-body)] text-sm leading-snug underline decoration-rule underline-offset-4 hover:decoration-strap"
                >
                  {sheet.title}
                </a>
                <span className="figure shrink-0 text-[0.625rem] text-ink-faint">
                  {sheet.accession}
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 figure text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                <span className="text-strap">{sheet.status}</span>
                <span aria-hidden>·</span>
                <span>{sheet.tier}</span>
                {sheet.citations > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{sheet.citations} cites</span>
                  </>
                ) : null}
                {sheet.decision ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-label">{sheet.decision}</span>
                  </>
                ) : null}
                {sheet.provenance === "fallback" ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-fallback">snapshot</span>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-sm border border-rule bg-paper-deep/40 px-3 py-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
          {sheets.length === 0
            ? "No sheets mounted yet. Mount one from the live index below."
            : "No sheets match these filters."}
        </p>
      )}
    </div>
  );
}