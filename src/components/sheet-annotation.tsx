"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { Sheet } from "@/lib/types";

/**
 * The margin rail: the reader's own note, written into the outer margin of a
 * mounted sheet. Persisted on save, sealed as an audit event, and rendered as
 * text — never as markup.
 */
export function SheetAnnotation({ sheet }: { sheet: Sheet }) {
  const [value, setValue] = useState(sheet.marginalia);
  const [saved, setSaved] = useState(sheet.marginalia);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== saved;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sheets/${sheet.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marginalia: value, expectedVersion: sheet.version }),
      });
      const payload = (await response.json()) as
        | { sheet: Sheet }
        | { error: { message: string } };
      if (!response.ok || !("sheet" in payload)) {
        setError("error" in payload ? payload.error.message : "Could not save the note.");
        return;
      }
      setSaved(payload.sheet.marginalia);
      setValue(payload.sheet.marginalia);
    } catch {
      setError("Network error. The note was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sheet margin-rail p-4" aria-labelledby="marginalia-heading">
      <h2 id="marginalia-heading" className="label-caps">
        Marginalia
      </h2>
      <label htmlFor={`marginalia-${sheet.id}`} className="sr-only">
        Your note on this sheet
      </label>
      <textarea
        id={`marginalia-${sheet.id}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={4000}
        rows={6}
        placeholder="What this sheet actually argued, and where it is weak."
        className="mt-2 w-full resize-y rounded-sm border border-rule bg-paper px-2.5 py-2 font-[family-name:var(--font-body)] text-sm italic"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-1.5 rounded-sm bg-field px-3 py-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Save className="h-3 w-3" aria-hidden />
          )}
          {busy ? "Saving" : "Save note"}
        </button>
        <span className="figure text-[0.625rem] text-ink-faint">{value.length}/4000</span>
      </div>
      {error ? (
        <p role="alert" className="mt-2 font-[family-name:var(--font-body)] text-xs text-stamp">
          {error}
        </p>
      ) : null}
    </section>
  );
}