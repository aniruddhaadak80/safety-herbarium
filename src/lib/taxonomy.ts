import type { ClassId, ClassWeights, EvidenceTier, SheetStatus } from "./types";

/**
 * The taxonomy the coverage engine measures against.
 *
 * Ten risk classes, each with a weighted lexicon. The lexicon is the only
 * judgement in the engine that looks like judgement: term weights are fixed
 * constants, terms are matched case-insensitively as whole substrings against
 * `title + abstract`, and each term counts at most once per sheet. Given the
 * same sheet text the affinity is therefore a pure function.
 *
 * A reader can always override a class by mounting a sheet onto that taxon or
 * by editing the determination on the sheet; the override is recorded in the
 * audit chain.
 */

export interface LexiconTerm {
  term: string;
  weight: number;
}

export interface RiskClass {
  id: ClassId;
  label: string;
  /** Short, plain statement of what the class covers. */
  blurb: string;
  /** Linnaean-style short code used on the determination plate. */
  code: string;
  lexicon: LexiconTerm[];
}

export const RISK_CLASSES: readonly RiskClass[] = [
  {
    id: "deceptive_alignment",
    label: "Deceptive alignment",
    code: "DA",
    blurb: "Models that appear aligned while pursuing something else.",
    lexicon: [
      { term: "deceptive alignment", weight: 3 },
      { term: "alignment faking", weight: 3 },
      { term: "alignment-faking", weight: 3 },
      { term: "sandbagging", weight: 2.4 },
      { term: "scheming", weight: 2.2 },
      { term: "strategic deception", weight: 2.6 },
      { term: "deception", weight: 1.6 },
      { term: "deceptive", weight: 1.8 },
      { term: "goal concealment", weight: 2 },
      { term: "faking alignment", weight: 2.6 },
      { term: "instrumental compliance", weight: 1.8 },
    ],
  },
  {
    id: "reward_misspecification",
    label: "Reward misspecification",
    code: "RM",
    blurb: "Optimising a proxy and getting something other than the intent.",
    lexicon: [
      { term: "reward hacking", weight: 2.8 },
      { term: "reward misspecification", weight: 2.8 },
      { term: "specification gaming", weight: 2.6 },
      { term: "goodhart", weight: 2.2 },
      { term: "wireheading", weight: 2.4 },
      { term: "proxy objective", weight: 2 },
      { term: "objective misspecification", weight: 2.4 },
      { term: "reward model", weight: 1.4 },
      { term: "extrinsic reward", weight: 1.6 },
      { term: "misaligned objective", weight: 1.8 },
      { term: "mesa-optimizer", weight: 1.6 },
    ],
  },
  {
    id: "scalable_oversight",
    label: "Scalable oversight",
    code: "SO",
    blurb: "Supervising systems that are harder to check than to run.",
    lexicon: [
      { term: "scalable oversight", weight: 3 },
      { term: "ai debate", weight: 2.4 },
      { term: "debate", weight: 1.2 },
      { term: "recursive reward modelling", weight: 2.6 },
      { term: "recursive reward modeling", weight: 2.6 },
      { term: "weak-to-strong", weight: 2.4 },
      { term: "weak to strong", weight: 2.4 },
      { term: "verifier", weight: 1.2 },
      { term: "process supervision", weight: 1.8 },
      { term: "superhuman oversight", weight: 2.6 },
      { term: "amplified oversight", weight: 2.4 },
    ],
  },
  {
    id: "interpretability",
    label: "Interpretability",
    code: "IX",
    blurb: "Reading the model rather than only its behaviour.",
    lexicon: [
      { term: "mechanistic interpretability", weight: 3 },
      { term: "mechanistic", weight: 1.6 },
      { term: "interpretability", weight: 2 },
      { term: "circuit", weight: 1.4 },
      { term: "feature learning", weight: 1.6 },
      { term: "sparse autoencoder", weight: 2.2 },
      { term: "sparse autoencoders", weight: 2.2 },
      { term: "representation engineering", weight: 2.2 },
      { term: "probing", weight: 1.4 },
      { term: "transparency", weight: 1.2 },
      { term: "concept erasure", weight: 1.8 },
    ],
  },
  {
    id: "value_uncertainty",
    label: "Value uncertainty",
    code: "VU",
    blurb: "We do not know the objective, so learning it is itself hard.",
    lexicon: [
      { term: "value learning", weight: 2.4 },
      { term: "value uncertainty", weight: 3 },
      { term: "preference learning", weight: 1.8 },
      { term: "preference aggregation", weight: 2.2 },
      { term: "moral uncertainty", weight: 2.4 },
      { term: "alignment tax", weight: 2 },
      { term: "pluralism", weight: 1.4 },
      { term: "utility", weight: 0.8 },
      { term: "human feedback", weight: 1.6 },
      { term: "reward modelling from human", weight: 1.6 },
      { term: "value alignment", weight: 2.2 },
    ],
  },
  {
    id: "corrigibility",
    label: "Corrigibility",
    code: "CO",
    blurb: "A system that accepts correction and stays interruptible.",
    lexicon: [
      { term: "corrigibility", weight: 3 },
      { term: "shutdown", weight: 2.2 },
      { term: "goal misgeneralization", weight: 2.6 },
      { term: "goal misgeneralisation", weight: 2.6 },
      { term: "tamper resistance", weight: 2.2 },
      { term: "tamper", weight: 1.4 },
      { term: "intervention", weight: 1 },
      { term: "interruptibility", weight: 2.4 },
      { term: "obedience", weight: 1.8 },
      { term: "modifiability", weight: 1.8 },
      { term: "safeguard", weight: 1.2 },
    ],
  },
  {
    id: "power_seeking",
    label: "Power seeking",
    code: "PS",
    blurb: "Instrumental convergence: capability that turns into leverage.",
    lexicon: [
      { term: "power seeking", weight: 3 },
      { term: "power-seeking", weight: 3 },
      { term: "instrumental convergence", weight: 2.8 },
      { term: "self-preservation", weight: 1.8 },
      { term: "resource acquisition", weight: 1.8 },
      { term: "takeover", weight: 1.6 },
      { term: "existential risk", weight: 1.8 },
      { term: "catastrophic risk", weight: 2 },
      { term: "loss of control", weight: 2.4 },
      { term: "autonomy", weight: 0.9 },
      { term: "ai race", weight: 1.6 },
    ],
  },
  {
    id: "robustness_fragility",
    label: "Robustness and fragility",
    code: "RF",
    blurb: "Whether the safety behaviour survives contact with an adversary.",
    lexicon: [
      { term: "jailbreak", weight: 2.2 },
      { term: "adversarial", weight: 1.6 },
      { term: "robustness", weight: 1.8 },
      { term: "fragility", weight: 2 },
      { term: "distribution shift", weight: 1.8 },
      { term: "out-of-distribution", weight: 1.6 },
      { term: "prompt injection", weight: 2 },
      { term: "attack", weight: 0.9 },
      { term: "brittle", weight: 1.8 },
      { term: "safety tuning", weight: 1.6 },
      { term: "overoptimization", weight: 1.6 },
    ],
  },
  {
    id: "evaluation_rigor",
    label: "Evaluation rigor",
    code: "EV",
    blurb: "Can the claim be measured, and is the measurement honest?",
    lexicon: [
      { term: "evaluation", weight: 1.4 },
      { term: "benchmark", weight: 1.6 },
      { term: "red team", weight: 2 },
      { term: "red-teaming", weight: 2 },
      { term: "contamination", weight: 2 },
      { term: "validity", weight: 1.2 },
      { term: "audit", weight: 1.6 },
      { term: "evals", weight: 1.6 },
      { term: "capability evaluation", weight: 2.2 },
      { term: "measurement", weight: 1 },
      { term: "meta-evaluation", weight: 2.2 },
    ],
  },
  {
    id: "governance_assurance",
    label: "Governance and assurance",
    code: "GA",
    blurb: "Standards, deployment rules and safety cases.",
    lexicon: [
      { term: "safety case", weight: 2.6 },
      { term: "governance", weight: 1.8 },
      { term: "regulation", weight: 1.6 },
      { term: "policy", weight: 1.2 },
      { term: "standard", weight: 1.4 },
      { term: "deployment", weight: 1.2 },
      { term: "assurance", weight: 2 },
      { term: "risk management", weight: 1.8 },
      { term: "compliance", weight: 1.6 },
      { term: "ai act", weight: 2 },
      { term: "responsible ai", weight: 1.4 },
    ],
  },
] as const;

export const CLASS_BY_ID: Readonly<Record<ClassId, RiskClass>> = Object.fromEntries(
  RISK_CLASSES.map((c) => [c.id, c]),
) as Record<ClassId, RiskClass>;

export function classLabel(id: ClassId): string {
  return CLASS_BY_ID[id].label;
}

/** How much one unit of evidence counts for, by the kind of source. */
export const TIER_WEIGHT: Readonly<Record<EvidenceTier, number>> = {
  monograph: 1,
  standard: 0.95,
  survey: 0.85,
  empirical: 0.8,
  theoretical: 0.65,
  position: 0.45,
};

/** How much a sheet counts while it sits at a given reading status. */
export const STATUS_WEIGHT: Readonly<Record<SheetStatus, number>> = {
  read: 1,
  reading: 0.55,
  queued: 0.2,
  parked: 0.1,
  rejected: 0,
};

/** Evidence load at which a class is half-covered. */
export const SATURATION = 1.2;

/** Coverage below this counts as an open gap worth recommending against. */
export const GAP_THRESHOLD = 0.35;

/** Citation count at which the citation factor reaches its ceiling. */
export const CITATION_CEILING = 3000;

/** Uniform starting weights; the settings route lets a reader tilt them. */
export function defaultWeights(): ClassWeights {
  return Object.fromEntries(
    RISK_CLASSES.map((c) => [c.id, 1]),
  ) as Record<ClassId, number>;
}

const TEXT_WEIGHT = /\bsurveys?\b|\bwe review\b|\ba comprehensive overview\b|\bthis book\b/i;
const EMPIRICAL_WEIGHT =
  /\bwe (introduce|present|propose|develop|release)\b|\bexperiments?\b|\bwe (train|evaluate|measure|benchmark)\b|\bwe show\b|\bempirical(?:ly)?\b|\bbenchmark\b/i;
const POSITION_WEIGHT = /\bwe (argue|claim|contend)\b|\bposition paper\b|\bperspective\b|\bcommentary\b/i;

/**
 * Derive the evidence tier from the record itself, so an imported sheet starts
 * with an honest default instead of a guess the reader has to make. An explicit
 * override on the sheet always wins.
 */
export function inferTier(input: {
  sourceKind: "arxiv" | "book";
  title: string;
  abstract: string;
  hostLabel?: string;
}): EvidenceTier {
  const text = `${input.title} ${input.abstract}`;
  if (input.sourceKind === "book") return "monograph";
  if (/\bnist\b|\biso\/|standard\b|\bframework\b/i.test(input.hostLabel ?? "") && TEXT_WEIGHT.test(text) === false) {
    return "standard";
  }
  if (TEXT_WEIGHT.test(text)) return "survey";
  if (POSITION_WEIGHT.test(text)) return "position";
  if (EMPIRICAL_WEIGHT.test(text)) return "empirical";
  return "theoretical";
}

/** Longest terms first, so "goal misgeneralization" beats "generalization". */
const ORDERED_LEXICON: readonly (readonly [ClassId, LexiconTerm])[] = RISK_CLASSES.flatMap((c) =>
  c.lexicon.map((t) => [c.id, t] as const),
).sort((a, b) => b[1].term.length - a[1].term.length);

/**
 * Class affinity for one record: a saturating sum of the lexicon weights its
 * title and abstract trip over. Manual determinations override it entirely.
 */
export function affinitiesFor(input: {
  title: string;
  abstract: string;
  determinations?: Partial<Record<ClassId, number>>;
}): Record<ClassId, number> {
  const haystack = ` ${`${input.title} ${input.abstract}`.toLowerCase().replace(/\s+/g, " ")} `;
  const raw = {} as Record<ClassId, number>;
  for (const c of RISK_CLASSES) raw[c.id] = 0;
  for (const [classId, term] of ORDERED_LEXICON) {
    if (haystack.includes(term.term)) raw[classId] += term.weight;
  }
  const out = {} as Record<ClassId, number>;
  for (const c of RISK_CLASSES) {
    const manual = input.determinations?.[c.id];
    out[c.id] =
      typeof manual === "number" && Number.isFinite(manual)
        ? round4(Math.min(1, Math.max(0, manual)))
        : round4(1 - Math.exp(-raw[c.id]));
  }
  return out;
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}