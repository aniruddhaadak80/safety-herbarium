import {
  CITATION_CEILING,
  CLASS_BY_ID,
  GAP_THRESHOLD,
  RISK_CLASSES,
  SATURATION,
  STATUS_WEIGHT,
  TIER_WEIGHT,
  affinitiesFor,
  round4,
} from "./taxonomy";
import { CLASS_IDS, type ClassId, type ClassWeights, type EvidenceTier, type SheetStatus } from "./types";
import { canonicalJson, sha256Hex } from "./canonical";

/**
 * herbarium-grade: the coverage engine.
 *
 * What it answers: of the ten AI-safety risk classes, which ones does this
 * reading volume actually have evidence for, and which are still open?
 *
 * The model, in full:
 *
 *   affinity(sheet, class)   = 1 - e^-(lexicon weight tripped in title+abstract)
 *                             (a manual determination on the sheet overrides it)
 *   evidence(sheet)          = tierWeight[tier] x statusWeight[status]
 *                                 x (1 + 0.4 x citationFactor(citations))
 *   load(class)              = SUM over sheets of affinity x evidence
 *   coverage(class)          = 1 - e^-(load(class) / SATURATION)
 *   score(volume)            = SUM over classes of normalisedWeight x coverage
 *
 * Sums saturate, so the tenth survey on one topic cannot dominate a volume, and
 * a single unread paper cannot close a gap: `queued` sheets carry 0.2 of a read
 * sheet's weight, and nothing carries zero coverage. Weights are normalised over
 * whatever classes the caller supplies, so a reader can tilt the score toward
 * the classes they care about without the engine having two code paths.
 *
 * Determinism: no clock, no randomness, no network. The same input object
 * always produces byte-identical output, which the tests assert by digest.
 */

export const ENGINE_VERSION = "herbarium-grade/1.0.0";

export interface EngineSheetInput {
  id: string;
  title: string;
  abstract: string;
  status: SheetStatus;
  tier: EvidenceTier;
  citations: number;
  determinations?: Partial<Record<ClassId, number>>;
}

export interface EngineCandidate {
  sourceId: string;
  title: string;
  abstract: string;
  url: string;
  publishedAt: string | null;
}

export interface EngineInput {
  volumeId: string;
  role: string;
  sheets: readonly EngineSheetInput[];
  weights: ClassWeights;
  /** Live discovery records used to recommend what to read next. */
  candidates?: readonly EngineCandidate[];
  /** Head of the volume's audit chain, echoed into the report. */
  referenceSeal: string;
}

export interface SheetContribution {
  sheetId: string;
  title: string;
  status: SheetStatus;
  tier: EvidenceTier;
  affinity: number;
  tierWeight: number;
  statusWeight: number;
  citationFactor: number;
  evidence: number;
  contribution: number;
}

export interface ClassFactor {
  classId: ClassId;
  code: string;
  label: string;
  blurb: string;
  weight: number;
  coverage: number;
  contribution: number;
  load: number;
  isGap: boolean;
  sheets: SheetContribution[];
}

export interface GapFactor {
  classId: ClassId;
  label: string;
  code: string;
  coverage: number;
  weight: number;
  deficit: number;
}

export interface RecommendationCandidate {
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  affinity: number;
  why: string;
}

export interface CoverageReport {
  engine: typeof ENGINE_VERSION;
  volumeId: string;
  role: string;
  score: number;
  referenceSeal: string;
  factors: ClassFactor[];
  gaps: GapFactor[];
  recommendation: {
    headline: string;
    primaryGap: ClassId | null;
    reason: string;
    candidates: RecommendationCandidate[];
  };
  evaluation: {
    sheetsConsidered: number;
    sheetsWeighted: number;
    classesMeasured: number;
    gapThreshold: number;
    saturation: number;
    /** Digest of the engine input; identical inputs give an identical digest. */
    inputDigest: string;
    counts: Record<SheetStatus, number>;
  };
}

/** Declaration order, used as the tie-break so gaps rank by intent, not alphabet. */
const CLASS_ORDER = new Map<ClassId, number>(RISK_CLASSES.map((c, i) => [c.id, i]));

function byDeficit(a: GapFactor, b: GapFactor): number {
  if (b.deficit !== a.deficit) return b.deficit - a.deficit;
  return (CLASS_ORDER.get(a.classId) ?? 0) - (CLASS_ORDER.get(b.classId) ?? 0);
}

function normaliseWeights(weights: ClassWeights): ClassWeights {
  const out = {} as ClassWeights;
  let total = 0;
  for (const id of CLASS_IDS) {
    const raw = Number.isFinite(weights[id]) ? Math.max(0, weights[id]) : 0;
    out[id] = raw;
    total += raw;
  }
  if (total <= 0) {
    for (const id of CLASS_IDS) out[id] = 1 / CLASS_IDS.length;
    return out;
  }
  for (const id of CLASS_IDS) out[id] = round4(out[id] / total);
  return out;
}

/**
 * Citations lift a sheet's weight by at most 40%, on a log scale, so a
 * thousand-citation survey cannot outweigh three independent experiments.
 * A missing count is treated as zero, never as an error.
 */
export function citationFactor(citations: number): number {
  const n = Number.isFinite(citations) && citations > 0 ? citations : 0;
  const ratio = Math.min(1, Math.log1p(n) / Math.log1p(CITATION_CEILING));
  return round4(1 + 0.4 * ratio);
}

export function evidenceWeight(input: {
  tier: EvidenceTier;
  status: SheetStatus;
  citations: number;
}): { tierWeight: number; statusWeight: number; citationFactor: number; evidence: number } {
  const tierWeight = TIER_WEIGHT[input.tier] ?? 0;
  const statusWeight = STATUS_WEIGHT[input.status] ?? 0;
  const citations = citationFactor(input.citations);
  return {
    tierWeight,
    statusWeight,
    citationFactor: citations,
    evidence: round4(tierWeight * statusWeight * citations),
  };
}

function countStatuses(sheets: readonly EngineSheetInput[]): Record<SheetStatus, number> {
  const counts = { queued: 0, reading: 0, read: 0, parked: 0, rejected: 0 } as Record<
    SheetStatus,
    number
  >;
  for (const sheet of sheets) {
    if (sheet.status in counts) counts[sheet.status] += 1;
  }
  return counts;
}

function inputDigestOf(input: EngineInput): string {
  return sha256Hex(
    canonicalJson({
      engine: ENGINE_VERSION,
      volumeId: input.volumeId,
      weights: input.weights,
      sheets: input.sheets.map((s) => ({
        id: s.id,
        status: s.status,
        tier: s.tier,
        citations: s.citations,
        determinations: s.determinations ?? {},
        text: `${s.title} ${s.abstract}`,
      })),
    }),
  );
}

/** The engine. Pure: same input, same output, every time. */
export function gradeVolume(input: EngineInput): CoverageReport {
  const weights = normaliseWeights(input.weights);
  const sheets = input.sheets.filter((s) => s.status !== "rejected");

  const factors: ClassFactor[] = [];
  for (const riskClass of RISK_CLASSES) {
    const classId = riskClass.id;
    const contributions: SheetContribution[] = [];
    let load = 0;

    for (const sheet of sheets) {
      const affinities = affinitiesFor({
        title: sheet.title,
        abstract: sheet.abstract,
        determinations: sheet.determinations,
      });
      const affinity = affinities[classId];
      if (affinity <= 0) continue;
      const weightsForSheet = evidenceWeight(sheet);
      const contribution = round4(affinity * weightsForSheet.evidence);
      if (contribution <= 0) continue;
      load += contribution;
      contributions.push({
        sheetId: sheet.id,
        title: sheet.title,
        status: sheet.status,
        tier: sheet.tier,
        affinity,
        tierWeight: weightsForSheet.tierWeight,
        statusWeight: weightsForSheet.statusWeight,
        citationFactor: weightsForSheet.citationFactor,
        evidence: weightsForSheet.evidence,
        contribution,
      });
    }

    contributions.sort((a, b) => b.contribution - a.contribution || a.sheetId.localeCompare(b.sheetId));
    const loadRounded = round4(load);
    const coverage = round4(1 - Math.exp(-loadRounded / SATURATION));
    const weight = weights[classId];

    factors.push({
      classId,
      code: riskClass.code,
      label: riskClass.label,
      blurb: riskClass.blurb,
      weight,
      coverage,
      contribution: round4(weight * coverage),
      load: loadRounded,
      isGap: coverage < GAP_THRESHOLD,
      sheets: contributions,
    });
  }

  const score = round4(factors.reduce((sum, f) => sum + f.contribution, 0));

  const gaps: GapFactor[] = factors
    .filter((f) => f.isGap)
    .map((f) => ({
      classId: f.classId,
      label: f.label,
      code: f.code,
      coverage: f.coverage,
      weight: f.weight,
      deficit: round4(f.weight * (1 - f.coverage)),
    }))
    .sort(byDeficit);

  const recommendation = buildRecommendation(gaps, input.candidates ?? []);

  return {
    engine: ENGINE_VERSION,
    volumeId: input.volumeId,
    role: input.role,
    score,
    referenceSeal: input.referenceSeal,
    factors,
    gaps,
    recommendation,
    evaluation: {
      sheetsConsidered: input.sheets.length,
      sheetsWeighted: sheets.length,
      classesMeasured: factors.length,
      gapThreshold: GAP_THRESHOLD,
      saturation: SATURATION,
      inputDigest: inputDigestOf(input),
      counts: countStatuses(input.sheets),
    },
  };
}

function buildRecommendation(
  gaps: readonly GapFactor[],
  candidates: readonly EngineCandidate[],
): CoverageReport["recommendation"] {
  if (gaps.length === 0) {
    return {
      headline: "No open classes: every risk class clears the coverage threshold.",
      primaryGap: null,
      reason: `All ${RISK_CLASSES.length} classes are at or above ${GAP_THRESHOLD} coverage.`,
      candidates: [],
    };
  }

  const gap = gaps[0];
  const riskClass = CLASS_BY_ID[gap.classId];
  const scored = candidates
    .map((candidate) => {
      const affinity = affinitiesFor({
        title: candidate.title,
        abstract: candidate.abstract,
      })[gap.classId];
      return { candidate, affinity };
    })
    .filter((entry) => entry.affinity > 0)
    .sort(
      (a, b) => b.affinity - a.affinity || a.candidate.sourceId.localeCompare(b.candidate.sourceId),
    )
    .slice(0, 3)
    .map<RecommendationCandidate>(({ candidate, affinity }) => ({
      sourceId: candidate.sourceId,
      title: candidate.title,
      url: candidate.url,
      publishedAt: candidate.publishedAt,
      affinity,
      why: `Matches ${riskClass.code} with affinity ${affinity.toFixed(2)} on the live index.`,
    }));

  return {
    headline: `Open: ${riskClass.label} is at ${(gap.coverage * 100).toFixed(0)}% coverage.`,
    primaryGap: gap.classId,
    reason: `Highest weighted deficit is ${gap.code} (${gap.deficit.toFixed(3)}), weighted ${gap.weight.toFixed(2)}. ${riskClass.blurb}`,
    candidates: scored,
  };
}