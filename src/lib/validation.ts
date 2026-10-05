import {
  CLASS_IDS,
  DECISIONS,
  EVIDENCE_TIERS,
  ROLES,
  SHEET_STATUSES,
  SOURCE_KINDS,
  type ClassId,
  type Decision,
  type EvidenceTier,
  type Role,
  type SheetStatus,
  type SourceKind,
} from "./types";
import { badRequest, payloadTooLarge } from "./errors";

/**
 * Input validation.
 *
 * Every untrusted string is length-bounded and shape-checked here before it can
 * reach SQL, a URL or the rendered page. Text that is echoed back into HTML is
 * constrained rather than escaped at the point of use, so a malicious abstract
 * cannot become markup, and nothing untrusted is ever passed to `dangerouslySet-
 * InnerHTML`.
 */

export const LIMITS = {
  name: 120,
  intent: 600,
  marginalia: 4000,
  decisionNote: 1000,
  abstract: 8000,
  authors: 1200,
  title: 600,
  url: 600,
  ids: 200,
  sheetIds: 40,
} as const;

const ARXIV_ID = /^\d{4}\.\d{4,5}$/;
const VERSIONED_ARXIV_ID = /^\d{4}\.\d{4,5}v\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const SHELF_KEY = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Hosts we will ever link to or embed. Anything else is rejected on ingest. */
export const ALLOWED_HOSTS = new Set([
  "arxiv.org",
  "export.arxiv.org",
  "www.aisafetybook.com",
  "aisafetybook.com",
  "nvlpubs.nist.gov",
  "storage.googleapis.com",
  "saif.org",
  "openreview.net",
  "deepmind.google",
]);

export function isAllowedHost(host: string): boolean {
  return ALLOWED_HOSTS.has(host.toLowerCase());
}

export function asString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw badRequest(`${field} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw payloadTooLarge(`${field} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

export function asOptionalString(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return asString(value, field, max);
}

export function asEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`${field} must be one of: ${allowed.join(", ")}.`, { allowed });
  }
  return value as T;
}

export function asId(value: unknown, field = "id"): string {
  const raw = asString(value, field, LIMITS.ids);
  if (!UUID.test(raw)) throw badRequest(`${field} must be a uuid.`);
  return raw.toLowerCase();
}

export function asShareToken(value: unknown): string {
  const raw = asString(value, "token", 64);
  if (!SHARE_TOKEN.test(raw)) throw badRequest("token is malformed.");
  return raw;
}

export function asArxivId(value: unknown): string {
  const raw = asString(value, "sourceId", 32);
  const stripped = VERSIONED_ARXIV_ID.test(raw) ? raw.replace(/v\d+$/, "") : raw;
  if (!ARXIV_ID.test(stripped)) throw badRequest("sourceId must be an arXiv id like 2411.01042.");
  return stripped;
}

export function asShelfKey(value: unknown): string {
  const raw = asString(value, "sourceId", 64);
  if (!SHELF_KEY.test(raw)) throw badRequest("sourceId must be a bookshelf key.");
  return raw;
}

/** A `sourceId` is either an arXiv id or a bookshelf key; sourceKind says which. */
export function asSourceRef(
  sourceKind: SourceKind,
  value: unknown,
): { kind: SourceKind; id: string } {
  return sourceKind === "arxiv"
    ? { kind: "arxiv", id: asArxivId(value) }
    : { kind: "book", id: asShelfKey(value) };
}

/** Only https, and only on the ingest allowlist. */
export function asHttpsUrl(value: unknown, field: string): string {
  const raw = asString(value, field, LIMITS.url);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest(`${field} must be an absolute https URL.`);
  }
  if (url.protocol !== "https:") throw badRequest(`${field} must use https.`);
  if (!isAllowedHost(url.hostname)) {
    throw badRequest(`${field} points at an untrusted host.`, { host: url.hostname });
  }
  return url.toString();
}

export function asBoundedInt(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw badRequest(`${field} must be an integer.`);
  }
  if (n < min || n > max) throw badRequest(`${field} must be between ${min} and ${max}.`);
  return n;
}

export function asUnit(value: unknown, field: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw badRequest(`${field} must be a number.`);
  if (n < 0 || n > 1) throw badRequest(`${field} must be between 0 and 1.`);
  return Math.round(n * 10000) / 10000;
}

/** A short single-line free-text field, with control characters removed. */
export function asSingleLine(value: unknown, field: string, max: number): string {
  return asString(value, field, max).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ");
}

export function asRole(value: unknown): Role {
  return asEnum<Role>(value, "role", ROLES);
}

export function asSheetStatus(value: unknown): SheetStatus {
  return asEnum<SheetStatus>(value, "status", SHEET_STATUSES);
}

export function asEvidenceTier(value: unknown): EvidenceTier {
  return asEnum<EvidenceTier>(value, "tier", EVIDENCE_TIERS);
}

export function asDecision(value: unknown): Decision {
  return asEnum<Decision>(value, "decision", DECISIONS);
}

export function asSourceKind(value: unknown): SourceKind {
  return asEnum<SourceKind>(value, "sourceKind", SOURCE_KINDS);
}

export function asClassId(value: unknown): ClassId {
  return asEnum<ClassId>(value, "classId", CLASS_IDS);
}

/**
 * A full-text discovery query. Kept short and stripped of arXiv query syntax so
 * a visitor cannot turn the discovery route into a proxy for arbitrary upstream
 * queries.
 */
export function asDiscoveryQuery(value: unknown): string {
  const raw = asString(value ?? "alignment", "q", 120);
  const cleaned = raw.replace(/[^a-zA-Z0-9 ._-]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2) throw badRequest("q must be at least 2 characters.");
  return cleaned;
}

export function asDeterminations(
  value: unknown,
): Partial<Record<ClassId, number>> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("determinations must be an object keyed by class id.");
  }
  const out: Partial<Record<ClassId, number>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!CLASS_IDS.includes(key as ClassId)) {
      throw badRequest(`unknown class id: ${key}`, { allowed: CLASS_IDS });
    }
    out[key as ClassId] = asUnit(raw, `determinations.${key}`);
  }
  return out;
}

/** Split a comma or newline separated author string into a bounded array. */
export function asAuthors(value: unknown): string[] {
  const raw = asString(value, "authors", LIMITS.authors);
  if (raw.length === 0) return [];
  return raw
    .split(/\s*(?:,|;|\band\b|\n)\s*/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    .slice(0, 40);
}

export function assertJsonBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw badRequest("Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}