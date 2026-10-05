"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Paperclip, Check } from "lucide-react";
import { CLASS_BY_ID } from "@/lib/taxonomy";
import type { ClassId, Sheet } from "@/lib/types";

/**
 * Mounting a record onto a risk class.
 *
 * The server resolves the record from its source, so this button only has to say
 * which taxon the sheet belongs on. On success it hands back the persisted sheet,
 * which the caller uses to show the real accession number rather than a
 * confirmation that could not have happened.
 */
export function MountControl({
  volumeId,
  volumeName,
  sourceKind,
  sourceId,
  title,
  mountedClass,
}: {
  volumeId: string;
  volumeName: string;
  sourceKind: "arxiv" | "book";
  sourceId: string;
  title: string;
  mountedClass?: ClassId;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "mounting" }
    | { kind: "done"; sheet: Sheet }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [taxon, setTaxon] = useState<ClassId | "">(mountedClass ?? "");

  async function mount() {
    setState({ kind: "mounting" });
    try {
      const response = await fetch(`/api/volumes/${volumeId}/sheets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKind,
          sourceId,
          ...(taxon ? { mountedClass: taxon } : {}),
        }),
      });
      const payload = (await response.json()) as
        | { sheet: Sheet; created: boolean }
        | { error: { message: string } };

      if (!response.ok || !("sheet" in payload)) {
        setState({
          kind: "error",
          message: "error" in payload ? payload.error.message : "Could not mount this record.",
        });
        return;
      }
      setState({ kind: "done", sheet: payload.sheet });
      startTransition(() => router.refresh());
    } catch {
      setState({ kind: "error", message: "Network error. Nothing was mounted." });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-field bg-field/8 px-3 py-2">
        <Check className="h-4 w-4 shrink-0 text-field" aria-hidden />
        <span className="font-[family-name:var(--font-mono)] text-xs text-field">
          Mounted · {state.sheet.accession} · {state.sheet.status}
        </span>
        <a
          href={`/sheet/${state.sheet.id}`}
          className="ml-auto font-[family-name:var(--font-mono)] text-xs underline decoration-rule underline-offset-4 hover:text-field"
        >
          Open sheet
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-paper-edge bg-paper-deep/50 p-3">
      <p className="label-caps">Mount onto</p>
      <p className="mt-1 line-clamp-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
        {title}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[11rem] flex-1">
          <label htmlFor={`taxon-${sourceId}`} className="label-caps">
            Risk class
          </label>
          <select
            id={`taxon-${sourceId}`}
            value={taxon}
            onChange={(event) => setTaxon(event.target.value as ClassId | "")}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-2 py-1.5 font-[family-name:var(--font-body)] text-sm text-ink"
          >
            <option value="">Let the engine decide</option>
            {Object.values(CLASS_BY_ID).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={mount}
          disabled={isPending || state.kind === "mounting"}
          className="inline-flex items-center gap-2 rounded-sm bg-field px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "mounting" || isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
          )}
          {state.kind === "mounting" ? "Mounting" : `Mount to ${volumeName}`}
        </button>
      </div>

      {state.kind === "error" ? (
        <p role="alert" className="mt-2 font-[family-name:var(--font-body)] text-sm text-stamp">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}