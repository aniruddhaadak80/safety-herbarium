import type { AuditEvent, ClassId, Decision, EvidenceTier, Role, Sheet, SheetStatus, SourceKind, Volume } from "../types";

/**
 * Row mapping.
 *
 * Both drivers return `date` and `timestamptz` as JS `Date`, so every column is
 * normalised to the ISO-8601 string the domain types promise. Nothing in the UI
 * ever sees a driver-specific value.
 */

export interface VolumeRow {
  id: string;
  name: string;
  intent: string;
  role: string;
  status: string;
  share_token: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  retired_at: Date | string | null;
  seal: string | null;
  event_count: string | number | null;
  sheet_count: string | number | null;
  read_count: string | number | null;
}

export interface SheetRow {
  id: string;
  volume_id: string;
  accession: string;
  source_kind: string;
  source_id: string;
  title: string;
  authors: string;
  abstract: string;
  url: string;
  pdf_url: string | null;
  host: string;
  license: string | null;
  published_at: Date | string | null;
  citations: number;
  tier: string;
  status: string;
  marginalia: string;
  determinations: unknown;
  mounted_class: string;
  decision: string | null;
  decision_note: string;
  provenance: string;
  version: number;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AuditRow {
  seq: number;
  event_type: string;
  payload: unknown;
  prev_seal: string;
  seal: string;
  created_at: Date | string;
}

function iso(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function dateOnly(value: Date | string | null): string | null {
  if (value === null) return null;
  return iso(value).slice(0, 10);
}

function count(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

export function mapVolume(row: VolumeRow): Volume {
  return {
    id: row.id,
    name: row.name,
    intent: row.intent,
    role: row.role as Role,
    status: row.status === "retired" ? "retired" : "active",
    shareToken: row.share_token,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    retiredAt: row.retired_at ? iso(row.retired_at) : null,
    seal: row.seal ?? "",
    eventCount: count(row.event_count),
    sheetCount: count(row.sheet_count),
    readCount: count(row.read_count),
  };
}

export function mapSheet(row: SheetRow): Sheet {
  let determinations: Partial<Record<ClassId, number>> = {};
  if (row.determinations && typeof row.determinations === "object") {
    determinations = row.determinations as Partial<Record<ClassId, number>>;
  }
  return {
    id: row.id,
    volumeId: row.volume_id,
    accession: row.accession,
    sourceKind: row.source_kind as SourceKind,
    sourceId: row.source_id,
    title: row.title,
    authors: row.authors.length > 0 ? row.authors.split("\u001f") : [],
    abstract: row.abstract,
    url: row.url,
    pdfUrl: row.pdf_url,
    host: row.host,
    license: row.license,
    publishedAt: dateOnly(row.published_at),
    citations: toNumber(row.citations),
    tier: row.tier as EvidenceTier,
    status: row.status as SheetStatus,
    marginalia: row.marginalia,
    determinations,
    mountedClass: row.mounted_class as ClassId,
    decision: (row.decision as Decision | null) ?? null,
    decisionNote: row.decision_note,
    version: toNumber(row.version),
    deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    provenance: row.provenance === "live" || row.provenance === "curated" ? row.provenance : "fallback",
  };
}

export function mapAudit(row: AuditRow): AuditEvent {
  const payload = (
    row.payload && typeof row.payload === "object" ? row.payload : {}
  ) as Record<string, unknown>;
  return {
    seq: toNumber(row.seq),
    eventType: row.event_type,
    payload,
    prevSeal: row.prev_seal,
    seal: row.seal,
    createdAt: iso(row.created_at),
  };
}

/** Postgres `date` columns accept a `YYYY-MM-DD` string; normalise any input. */
export function toDbDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}