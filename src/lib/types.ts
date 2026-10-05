/**
 * Domain types.
 *
 * Every external source is normalised into these shapes before it reaches a
 * component, a test or the database, so the UI never depends on an upstream
 * wire format. Provenance travels with the record: `live` and `fallback` are
 * always distinguishable, and user-created rows are never produced by a source.
 */

/** The ten risk classes the coverage engine measures a volume against. */
export const CLASS_IDS = [
  "deceptive_alignment",
  "reward_misspecification",
  "scalable_oversight",
  "interpretability",
  "value_uncertainty",
  "corrigibility",
  "power_seeking",
  "robustness_fragility",
  "evaluation_rigor",
  "governance_assurance",
] as const;

export type ClassId = (typeof CLASS_IDS)[number];

export const ROLES = ["student", "researcher", "engineer", "policy", "generalist"] as const;
export type Role = (typeof ROLES)[number];

export const SHEET_STATUSES = ["queued", "reading", "read", "parked", "rejected"] as const;
export type SheetStatus = (typeof SHEET_STATUSES)[number];

export const EVIDENCE_TIERS = [
  "monograph",
  "standard",
  "survey",
  "empirical",
  "theoretical",
  "position",
] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

export const DECISIONS = ["admitted", "deferred", "rejected"] as const;
export type Decision = (typeof DECISIONS)[number];

export const SOURCE_KINDS = ["arxiv", "book"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * Where a record's data came from. All three are surfaced in the UI and never
 * blurred together:
 *  - `live`     fetched from the upstream host during this request;
 *  - `curated`  from the checked-in open-access bookshelf catalogue, whose PDF
 *               URLs are verified live on demand by `/api/bookshelf/verify`;
 *  - `fallback` from a dated, sealed offline snapshot because upstream was
 *               unreachable. Never presented as current.
 */
export type Provenance = "live" | "curated" | "fallback";

/** A paper or open-access book, normalised from arXiv, OpenAlex or the bookshelf. */
export interface SourceRecord {
  sourceKind: SourceKind;
  /** arXiv id without a version suffix, or the bookshelf key. Stable identity. */
  sourceId: string;
  title: string;
  authors: string[];
  abstract: string;
  /** Human-facing landing page. */
  url: string;
  pdfUrl: string | null;
  /** Origin host, e.g. `arxiv.org`. Constrained to an allowlist on ingest. */
  host: string;
  hostLabel: string;
  license: string | null;
  /** ISO-8601 date, date only. */
  publishedAt: string | null;
  /** OpenAlex citation count, or null when unavailable. */
  citations: number | null;
  /** Evidence tier derived from the record, overridable once mounted. */
  tier: EvidenceTier;
  provenance: Provenance;
  /** Identifier on the upstream host, kept for re-linking and provenance. */
  upstreamId: string;
  /** ISO-8601 instant the record was retrieved. */
  fetchedAt: string;
  attribution: string;
}

export interface SourceEnvelope {
  provenance: Provenance;
  fetchedAt: string;
  items: SourceRecord[];
  sources: SourceCitation[];
  /** Present only when provenance is `fallback`. */
  note?: string;
}

export interface SourceCitation {
  id: string;
  label: string;
  url: string;
  license: string | null;
  provenance: Provenance;
}

export interface Volume {
  id: string;
  name: string;
  intent: string;
  role: Role;
  status: "active" | "retired";
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
  /** Head of the volume's audit chain. */
  seal: string;
  eventCount: number;
  sheetCount: number;
  readCount: number;
}

export interface Sheet {
  id: string;
  volumeId: string;
  accession: string;
  sourceKind: SourceKind;
  sourceId: string;
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  pdfUrl: string | null;
  host: string;
  license: string | null;
  publishedAt: string | null;
  citations: number;
  tier: EvidenceTier;
  status: SheetStatus;
  marginalia: string;
  /** Manual determination overrides keyed by class, values 0..1. */
  determinations: Partial<Record<ClassId, number>>;
  mountedClass: ClassId;
  decision: Decision | null;
  decisionNote: string;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Provenance of the upstream record this sheet was mounted from. */
  provenance: Provenance;
}

export interface AuditEvent {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  prevSeal: string;
  seal: string;
  createdAt: string;
}

export type ClassWeights = { [K in ClassId]: number };

/** Stable error envelope returned by every route and by every MCP tool result. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}