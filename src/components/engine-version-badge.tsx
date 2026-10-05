import { ENGINE_VERSION } from "@/lib/engine";
import { GAP_THRESHOLD, RISK_CLASSES, SATURATION } from "@/lib/taxonomy";

/**
 * The engine's version and constants, stated rather than implied. A reader
 * comparing two reports needs to know whether the same rules produced both.
 */
export function EngineVersionBadge() {
  return (
    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 figure text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
      <span className="text-field">{ENGINE_VERSION}</span>
      <span>saturation {SATURATION}</span>
      <span>gap threshold {(GAP_THRESHOLD * 100).toFixed(0)}%</span>
      <span>weights renormalised over {RISK_CLASSES.length} classes</span>
    </p>
  );
}