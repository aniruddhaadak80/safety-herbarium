import { RISK_CLASSES } from "../taxonomy";
import type { ClassId } from "../types";

/**
 * Turning the taxonomy into an arXiv query.
 *
 * The visitor's own text is never interpolated into an upstream query: a search
 * string is a fixed, checked-in set of phrases drawn from the risk taxonomy, so
 * the discovery route can never be turned into an open proxy for arbitrary
 * upstream queries. `q` is handled separately, by the library search route, and
 * even there it is sanitised to letters, digits and spaces before use.
 */

/** The default feed: a relevance search across the field's load-bearing phrases. */
const DEFAULT_TERMS = [
  "AI alignment",
  "deceptive alignment",
  "scalable oversight",
  "mechanistic interpretability",
  "reward hacking",
  "corrigibility",
  "power seeking",
  "AI safety evaluation",
] as const;

export function buildSafetyQuery(): string {
  return DEFAULT_TERMS.map((term) => `all:"${term}"`).join(" OR ");
}

/** A relevance query aimed at one risk class, used to fill coverage gaps. */
export function queryForClass(classId: string): string | null {
  const match = RISK_CLASSES.find((c) => c.id === classId);
  if (!match) return null;
  const terms = match.lexicon
    .slice()
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, 5)
    .map((t) => t.term);
  const parts = [`abs:"${match.label}"`, ...terms.map((term) => `abs:"${term}"`)];
  return parts.join(" OR ");
}

/** The default terms behind the discovery feed, surfaced in the UI for honesty. */
export function defaultSearchTerms(): readonly string[] {
  return DEFAULT_TERMS;
}

export function isClassId(value: string): value is ClassId {
  return RISK_CLASSES.some((c) => c.id === value);
}