import Link from "next/link";
import type { RiskClass } from "@/lib/taxonomy";
import { GENESIS_SEAL } from "@/lib/canonical";
import { ArrowRight } from "lucide-react";

/**
 * The plate on a new visitor's first screen: what the engine will measure, and an
 * honest statement about what it has not measured yet. On a volume, the same slot
 * carries the real score and the chain head.
 */
export function EngineReadout({
  primaryGap,
  score,
  referenceSeal,
}: {
  primaryGap: RiskClass;
  score?: number;
  referenceSeal?: string | null;
}) {
  const seal = referenceSeal ?? GENESIS_SEAL;

  return (
    <div className="sheet strap p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-caps">Coverage engine</p>
        <p className="figure text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
          herbarium-grade/1.0.0
        </p>
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <span className="figure text-5xl leading-none">
          {score === undefined ? "—" : score.toFixed(3)}
        </span>
        <span className="font-[family-name:var(--font-body)] text-sm text-ink-soft">
          {score === undefined ? (
            <>No volume mounted yet</>
          ) : (
            <>weighted coverage across ten classes</>
          )}
        </span>
      </div>

      <dl className="mt-5 space-y-3 border-t border-rule pt-4">
        <div>
          <dt className="label-caps">Primary open class</dt>
          <dd className="mt-0.5">
            <span className="determination text-lg">{primaryGap.label}</span>
            <span className="ml-2 figure text-xs text-ink-faint">{primaryGap.code}</span>
          </dd>
          <dd className="mt-0.5 font-[family-name:var(--font-body)] text-sm text-ink-soft">
            {primaryGap.blurb}
          </dd>
        </div>
        <div>
          <dt className="label-caps">Chain head</dt>
          <dd className="mt-0.5 break-all figure text-[0.625rem] text-ink-faint">{seal}</dd>
        </div>
      </dl>

      <Link
        href="/coverage"
        className="mt-5 inline-flex items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-field underline decoration-rule underline-offset-4 hover:decoration-strap"
      >
        Open the coverage lab
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}