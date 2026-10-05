"use client";

import { useMemo, useState } from "react";
import { RISK_CLASSES, round4 } from "@/lib/taxonomy";
import type { ClassFactor } from "@/lib/engine";

/**
 * The coverage plate: a herbarium's determination chart.
 *
 * Each risk class is a row on a ruled scale, with the volume's coverage drawn as
 * a measured length. The signature interaction lives here — moving the emphasis
 * slider re-weights the same factors and redraws the plate client-side, with the
 * full recompute still available on the server.
 *
 * The plate is not decorative: every length is `factor.coverage` from the engine,
 * and the sum of `weight x coverage` is the volume score. It renders identically
 * with animation disabled.
 */
export function CoveragePlate({
  factors,
  score,
  weights,
  engine,
  onWeightsChange,
  compact = false,
}: {
  factors: readonly ClassFactor[];
  score: number;
  weights: Record<string, number>;
  engine: string;
  onWeightsChange?: (weights: Record<string, number>) => void;
  compact?: boolean;
}) {
  const [emphasis, setEmphasis] = useState<Record<string, number>>(weights);

  /**
   * Live re-weighting, computed from the engine's own contributions rather than a
   * second implementation of the formula: normalised weight x coverage.
   */
  const preview = useMemo(() => {
    const total = Object.values(emphasis).reduce((sum, w) => sum + (Number.isFinite(w) ? Math.max(0, w) : 0), 0);
    if (total <= 0) return { score: 0, rows: factors.map((f) => ({ factor: f, effective: f.weight })) };
    const rows = factors.map((factor) => {
      const raw = Number.isFinite(emphasis[factor.classId]) ? Math.max(0, emphasis[factor.classId]) : 0;
      return { factor, effective: raw / total };
    });
    const previewScore = round4(rows.reduce((sum, r) => sum + r.effective * r.factor.coverage, 0));
    return { score: previewScore, rows };
  }, [emphasis, factors]);

  const shifted = Math.abs(preview.score - score) > 0.0001;

  return (
    <section aria-labelledby="coverage-plate-heading" className={compact ? "" : "mt-8"}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="coverage-plate-heading" className="label-caps">
          Determination plate
        </h2>
        <p className="figure text-xs text-ink-faint">
          {engine} ·{" "}
          <span className={shifted ? "text-caution" : "text-field"}>
            score {(shifted ? preview.score : score).toFixed(3)}
            {shifted ? " (preview)" : ""}
          </span>
        </p>
      </div>

      <div className="mt-3 overflow-x-auto scroll-thin">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">
            Coverage by AI-safety risk class. Each row shows the class, its weight in the
            score, the coverage the engine computed, and whether the class is still an open gap.
          </caption>
          <thead>
            <tr className="border-b border-ink">
              <th scope="col" className="label-caps py-1.5 pr-3 font-normal">
                Taxon
              </th>
              <th scope="col" className="label-caps py-1.5 pr-3 font-normal">
                Code
              </th>
              <th scope="col" className="label-caps py-1.5 pr-3 font-normal">
                Coverage
              </th>
              <th scope="col" className="label-caps py-1.5 pr-3 text-right font-normal">
                Weight
              </th>
              {onWeightsChange ? (
                <th scope="col" className="label-caps py-1.5 text-right font-normal">
                  Emphasis
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map(({ factor, effective }) => (
              <tr key={factor.classId} className="border-b border-rule/60 align-middle">
                <th scope="row" className="py-2 pr-3 font-[family-name:var(--font-body)] font-normal">
                  <span className="determination">{factor.label}</span>
                  {factor.isGap ? (
                    <span className="ml-2 align-middle font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-caution">
                      open
                    </span>
                  ) : null}
                </th>
                <td className="figure py-2 pr-3 text-xs text-ink-faint">{factor.code}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="bar-track w-24 sm:w-32" aria-hidden>
                      <div
                        className={factor.isGap ? "bar-fill-gap" : "bar-fill"}
                        style={{ width: `${Math.max(1.5, factor.coverage * 100)}%` }}
                      />
                    </div>
                    <span className="figure text-xs text-ink-soft">
                      {(factor.coverage * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="figure py-2 pr-3 text-right text-xs text-ink-soft">
                  {effective.toFixed(3)}
                </td>
                {onWeightsChange ? (
                  <td className="py-2 text-right">
                    <label className="sr-only" htmlFor={`emphasis-${factor.classId}`}>
                      Emphasis on {factor.label}
                    </label>
                    <input
                      id={`emphasis-${factor.classId}`}
                      type="range"
                      min={0}
                      max={3}
                      step={0.05}
                      value={emphasis[factor.classId] ?? 1}
                      onChange={(event) => {
                        const next = { ...emphasis, [factor.classId]: Number(event.target.value) };
                        setEmphasis(next);
                        onWeightsChange(next);
                      }}
                      className="w-20 accent-field"
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shifted ? (
        <p className="mt-3 font-[family-name:var(--font-body)] text-sm text-caution">
          These weights differ from the saved ones. The plate previews the score; save them on
          Settings to make it stick.
        </p>
      ) : (
        <p className="mt-3 font-[family-name:var(--font-body)] text-sm text-ink-faint">
          A class is an open gap below {(0.35 * 100).toFixed(0)}% coverage. Weights are the share of
          the score each class carries, after normalisation.
        </p>
      )}
    </section>
  );
}

/** The compact legend, used above the plate on narrow screens. */
export function PlateLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-faint">
      {RISK_CLASSES.map((c) => (
        <li key={c.id} className="font-[family-name:var(--font-mono)] uppercase tracking-[0.12em]">
          <span className="text-ink-soft">{c.code}</span> {c.label}
        </li>
      ))}
    </ul>
  );
}