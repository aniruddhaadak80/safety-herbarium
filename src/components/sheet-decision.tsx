"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { DECISIONS, SHEET_STATUSES, type Decision, type Sheet, type SheetStatus } from "@/lib/types";
import { CLASS_BY_ID } from "@/lib/taxonomy";

/**
 * Deciding on a mounted sheet.
 *
 * The decisive user action: change reading status, record an admit/defer/reject
 * decision with a reason, and write marginalia. Each control patches the row and
 * reports the persisted version back, so the displayed state is always the state
 * in the database.
 */
export function SheetDecision({ sheet }: { sheet: Sheet }) {
  const router = useRouter();
  const [current, setCurrent] = useState(sheet);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(sheet.decisionNote);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(`/api/sheets/${current.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, expectedVersion: current.version }),
      });
      const payload = (await response.json()) as
        | { sheet: Sheet }
        | { error: { message: string } };
      if (!response.ok || !("sheet" in payload)) {
        setError("error" in payload ? payload.error.message : "Could not save that change.");
        return;
      }
      setCurrent(payload.sheet);
      router.refresh();
    } catch {
      setError("Network error. The change was not saved.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshCitations() {
    setBusy("citations");
    setError(null);
    try {
      const response = await fetch(`/api/sheets/${current.id}/citations`, { method: "POST" });
      const payload = (await response.json()) as
        | { sheet: Sheet }
        | { error: { message: string } };
      if (!response.ok || !("sheet" in payload)) {
        setError("error" in payload ? payload.error.message : "Could not refresh citations.");
        return;
      }
      setCurrent(payload.sheet);
      router.refresh();
    } catch {
      setError("Network error. Citations were left unchanged.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    try {
      const response = await fetch(`/api/sheets/${current.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { error: { message: string } };
        setError(payload.error?.message ?? "Could not remove this sheet.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Nothing was removed.");
    } finally {
      setBusy(null);
    }
  }

  const riskClass = CLASS_BY_ID[current.mountedClass];

  return (
    <div className="sheet p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a
          href={`/sheet/${current.id}`}
          className="font-[family-name:var(--font-body)] text-sm leading-snug underline decoration-rule underline-offset-4 hover:decoration-strap"
        >
          {current.title}
        </a>
        <span className="figure shrink-0 text-[0.625rem] text-ink-faint">
          {current.accession} · v{current.version}
        </span>
      </div>

      <p className="mt-1 figure text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
        mounted on{" "}
        <span className="text-label">
          {riskClass.code} {riskClass.label}
        </span>
        {" · "}
        {current.tier}
        {current.citations > 0 ? ` · ${current.citations} cites` : ""}
        {current.provenance === "fallback" ? (
          <>
            {" · "}
            <span className="text-fallback">from snapshot</span>
          </>
        ) : null}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`status-${current.id}`} className="label-caps">
            Reading status
          </label>
          <select
            id={`status-${current.id}`}
            value={current.status}
            disabled={busy !== null}
            onChange={(event) => patch({ status: event.target.value as SheetStatus }, "status")}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-2.5 py-1.5 font-[family-name:var(--font-body)] text-sm disabled:opacity-60"
          >
            {SHEET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`decision-${current.id}`} className="label-caps">
            Decision
          </label>
          <select
            id={`decision-${current.id}`}
            value={current.decision ?? ""}
            disabled={busy !== null}
            onChange={(event) =>
              patch({ decision: event.target.value as Decision, decisionNote: note }, "decision")
            }
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-2.5 py-1.5 font-[family-name:var(--font-body)] text-sm disabled:opacity-60"
          >
            <option value="">undecided</option>
            {DECISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={`note-${current.id}`} className="label-caps">
          Why (sealed into the chain)
        </label>
        <textarea
          id={`note-${current.id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          rows={2}
          disabled={busy !== null}
          placeholder="Core evidence for the deceptive-alignment claim; weak on oversight."
          className="mt-1 w-full resize-y rounded-sm border border-rule bg-paper px-2.5 py-1.5 font-[family-name:var(--font-body)] text-sm disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => patch({ decisionNote: note }, "note")}
          disabled={busy !== null || note === current.decisionNote}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-sm border border-rule px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-field hover:text-field disabled:opacity-50"
        >
          {busy === "note" ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3 w-3" aria-hidden />
          )}
          Save note
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        {current.sourceKind === "arxiv" ? (
          <button
            type="button"
            onClick={refreshCitations}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-soft underline decoration-rule underline-offset-4 hover:text-field disabled:opacity-50"
          >
            {busy === "citations" ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden />
            )}
            Refresh citations
          </button>
        ) : null}

        {confirmRemove ? (
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="font-[family-name:var(--font-body)] text-xs text-ink-soft">
              Remove, leaving a tombstone?
            </span>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="rounded-sm border border-rule px-2 py-1 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em]"
            >
              <X className="inline h-3 w-3" aria-hidden /> Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-sm border border-stamp px-2 py-1 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-stamp disabled:opacity-50"
            >
              {busy === "remove" ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-3 w-3" aria-hidden />
              )}
              Confirm
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            disabled={busy !== null}
            className="ml-auto inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint underline decoration-rule underline-offset-4 hover:text-stamp disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            Remove
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 font-[family-name:var(--font-body)] text-sm text-stamp">
          {error}
        </p>
      ) : null}
    </div>
  );
}