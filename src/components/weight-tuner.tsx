"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { RISK_CLASSES } from "@/lib/taxonomy";
import type { ClassWeights } from "@/lib/types";

/**
 * Tilting the class priors.
 *
 * The weights are the only part of the score a reader controls, so they get a
 * real control that persists. Saving is a genuine PATCH; resetting returns the
 * uniform default the engine starts from.
 */
export function WeightTuner({ initialWeights }: { initialWeights: Record<string, number> }) {
  const [weights, setWeights] = useState<ClassWeights>(() => ({
    ...(Object.fromEntries(RISK_CLASSES.map((c) => [c.id, 1])) as ClassWeights),
    ...(initialWeights as Partial<ClassWeights>),
  }));
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const dirty = RISK_CLASSES.some((c) => weights[c.id] !== (initialWeights[c.id] ?? 1));

  async function save(next: ClassWeights, kind: "save" | "reset") {
    setBusy(kind);
    setMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weights: next }),
      });
      const payload = (await response.json()) as
        | { weights: ClassWeights }
        | { error: { message: string } };
      if (!response.ok || !("weights" in payload)) {
        setMessage({
          tone: "err",
          text: "error" in payload ? payload.error.message : "Could not save the weights.",
        });
        return;
      }
      setWeights(payload.weights);
      setMessage({
        tone: "ok",
        text:
          kind === "reset"
            ? "Weights reset to uniform. Every coverage score will now be recomputed on the next read."
            : "Weights saved. The next coverage read uses them.",
      });
    } catch {
      setMessage({ tone: "err", text: "Network error. Weights were not saved." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sheet p-4" aria-labelledby="weights-heading">
      <h2 id="weights-heading" className="label-caps">
        Class priors
      </h2>
      <p className="mt-1 font-[family-name:var(--font-body)] text-xs text-ink-faint">
        How much each risk class contributes to the score. Normalised before use, so only the
        relative sizes matter.
      </p>

      <ul className="mt-3 space-y-2">
        {RISK_CLASSES.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <label htmlFor={`weight-${c.id}`} className="figure w-6 shrink-0 text-[0.625rem] text-strap">
              {c.code}
            </label>
            <input
              id={`weight-${c.id}`}
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={weights[c.id]}
              onChange={(event) =>
                setWeights({ ...weights, [c.id]: Number(event.target.value) })
              }
              className="w-24 flex-1 accent-field"
            />
            <span className="figure w-9 shrink-0 text-right text-[0.625rem] text-ink-soft">
              {weights[c.id].toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save(weights, "save")}
          disabled={busy !== null || !dirty}
          className="inline-flex items-center gap-1.5 rounded-sm bg-field px-3 py-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright disabled:opacity-50"
        >
          {busy === "save" ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Save className="h-3 w-3" aria-hidden />
          )}
          Save weights
        </button>
        <button
          type="button"
          onClick={() =>
            save(Object.fromEntries(RISK_CLASSES.map((c) => [c.id, 1])) as ClassWeights, "reset")
          }
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-3 py-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
        >
          {busy === "reset" ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="h-3 w-3" aria-hidden />
          )}
          Reset to uniform
        </button>
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-2 font-[family-name:var(--font-body)] text-xs ${message.tone === "ok" ? "text-field" : "text-stamp"}`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}