import { randomUUID } from "node:crypto";
import { withTransaction, readyDb, type SqlExecutor } from "./db/client";
import { mapAudit, mapSheet, mapVolume, toDbDate, type AuditRow, type SheetRow, type VolumeRow } from "./db/rows";
import { GENESIS_SEAL, replayChain, sealFor, type ReplayReport } from "./canonical";
import { conflict, notFound, unauthorized } from "./errors";
import { newShareToken } from "./session";
import { consume } from "./rate-limit";
import { sha256Hex } from "./canonical";
import { affinitiesFor, defaultWeights } from "./taxonomy";
import { resolveSource } from "./sources/resolve";
import { gradeVolume, type CoverageReport, type EngineCandidate } from "./engine";
import {
  CLASS_IDS,
  type AuditEvent,
  type ClassId,
  type ClassWeights,
  type Sheet,
  type SheetStatus,
  type Volume,
} from "./types";

/**
 * The domain service.
 *
 * Every mutation in the product goes through this module: the REST routes, the
 * server-rendered pages and the MCP tools all call the same functions against the
 * same store, so the agent interface cannot drift from the interface. Each
 * mutation and the audit event that seals it are written inside one transaction,
 * with the volume row locked, so a seal can never exist without the state it
 * seals.
 */

const AUTHOR_SEP = "\u001f";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids are checked at the service boundary as well as in the route layer, so a
 * malformed id produces the same 404 as a missing row instead of leaking a
 * driver-level "invalid input syntax for type uuid".
 */
function assertId(id: string, label: string): string {
  if (!UUID_RE.test(id)) throw notFound(`No such ${label}.`);
  return id;
}

export interface CreateVolumeInput {
  name: string;
  intent: string;
  role: Volume["role"];
}

export interface MountSheetInput {
  sourceKind: "arxiv" | "book";
  sourceId: string;
  mountedClass?: ClassId;
  idempotencyKey?: string;
}

export interface UpdateSheetInput {
  status?: SheetStatus;
  marginalia?: string;
  decision?: "admitted" | "deferred" | "rejected" | null;
  decisionNote?: string;
  determinations?: Partial<Record<ClassId, number>>;
  tier?: Sheet["tier"];
  expectedVersion?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function appendAudit(
  db: SqlExecutor,
  volumeId: string,
  eventType: string,
  payload: Record<string, unknown>,
  at: string,
): Promise<{ seq: number; seal: string }> {
  const { rows } = await db.query<{ seq: number; seal: string }>(
    `SELECT COALESCE(MAX(seq), 0) AS seq,
            COALESCE((SELECT seal FROM hb_audit WHERE volume_id = $1 ORDER BY seq DESC LIMIT 1), $2) AS seal
       FROM hb_audit
      WHERE volume_id = $1`,
    [volumeId, GENESIS_SEAL],
  );
  const seq = Number(rows[0]?.seq ?? 0) + 1;
  const prevSeal = rows[0]?.seal ?? GENESIS_SEAL;
  const seal = sealFor(prevSeal, { seq, eventType, payload, at });
  await db.query(
    `INSERT INTO hb_audit (volume_id, seq, event_type, payload, prev_seal, seal, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::timestamptz)`,
    [volumeId, seq, eventType, JSON.stringify(payload), prevSeal, seal, at],
  );
  return { seq, seal };
}

const VOLUME_SELECT = `
  SELECT v.id, v.name, v.intent, v.role, v.status, v.share_token,
         v.created_at, v.updated_at, v.retired_at,
         COALESCE((SELECT seal FROM hb_audit a WHERE a.volume_id = v.id ORDER BY a.seq DESC LIMIT 1), $2) AS seal,
         (SELECT COUNT(*) FROM hb_audit a WHERE a.volume_id = v.id) AS event_count,
         (SELECT COUNT(*) FROM hb_sheets s WHERE s.volume_id = v.id AND s.deleted_at IS NULL) AS sheet_count,
         (SELECT COUNT(*) FROM hb_sheets s WHERE s.volume_id = v.id AND s.deleted_at IS NULL AND s.status = 'read') AS read_count
    FROM hb_volumes v
   WHERE v.scope = $1`;

export async function createVolume(scope: string, input: CreateVolumeInput): Promise<Volume> {
  const db = await readyDb();
  await consume(db, scope, "volume");
  const id = randomUUID();
  const at = nowIso();

  return withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO hb_volumes (id, scope, name, intent, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz)`,
      [id, scope, input.name, input.intent, input.role, at],
    );
    await appendAudit(
      tx,
      id,
      "volume.created",
      { volumeId: id, name: input.name, intent: input.intent, role: input.role },
      at,
    );
    const { rows } = await tx.query<VolumeRow>(`${VOLUME_SELECT} AND v.id = $3`, [scope, GENESIS_SEAL, id]);
    return mapVolume(rows[0]);
  });
}

export async function listVolumes(
  scope: string,
  options: { includeRetired?: boolean; limit?: number } = {},
): Promise<Volume[]> {
  const db = await readyDb();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const statusClause = options.includeRetired ? "" : " AND v.status = 'active'";
  const { rows } = await db.query<VolumeRow>(
    `${VOLUME_SELECT}${statusClause} ORDER BY v.created_at DESC LIMIT $3`,
    [scope, GENESIS_SEAL, limit],
  );
  return rows.map(mapVolume);
}

export async function getVolume(scope: string, rawId: string): Promise<Volume> {
  const id = assertId(rawId, "volume");
  const db = await readyDb();
  const { rows } = await db.query<VolumeRow>(`${VOLUME_SELECT} AND v.id = $3`, [
    scope,
    GENESIS_SEAL,
    id,
  ]);
  if (rows.length === 0) throw notFound("No such volume in this session.");
  return mapVolume(rows[0]);
}

/** The share route: a read-only view of one volume, addressed by share token. */
export async function getSharedVolume(
  token: string,
): Promise<{ volume: Volume; sheets: Sheet[] }> {
  const db = await readyDb();
  const { rows } = await db.query<VolumeRow>(
    `SELECT v.id, v.name, v.intent, v.role, v.status, v.share_token,
            v.created_at, v.updated_at, v.retired_at,
            COALESCE((SELECT seal FROM hb_audit a WHERE a.volume_id = v.id ORDER BY a.seq DESC LIMIT 1), $1) AS seal,
            (SELECT COUNT(*) FROM hb_audit a WHERE a.volume_id = v.id) AS event_count,
            (SELECT COUNT(*) FROM hb_sheets s WHERE s.volume_id = v.id AND s.deleted_at IS NULL) AS sheet_count,
            (SELECT COUNT(*) FROM hb_sheets s WHERE s.volume_id = v.id AND s.deleted_at IS NULL AND s.status = 'read') AS read_count
       FROM hb_volumes v
      WHERE v.share_token = $2`,
    [GENESIS_SEAL, token],
  );
  if (rows.length === 0) throw notFound("No such shared volume.");
  const volume = mapVolume(rows[0]);
  const sheets = await listSheetsByVolumeId(volume.id);
  return { volume, sheets };
}

export async function updateVolume(
  scope: string,
  rawId: string,
  input: Partial<CreateVolumeInput>,
): Promise<Volume> {
  const id = assertId(rawId, "volume");
  const db = await readyDb();
  await consume(db, scope, "write");
  const at = nowIso();

  return withTransaction(async (tx) => {
    const locked = await tx.query<{ id: string; status: string }>(
      `SELECT id, status FROM hb_volumes WHERE id = $1 AND scope = $2 FOR UPDATE`,
      [id, scope],
    );
    if (locked.rows.length === 0) throw notFound("No such volume in this session.");

    const sets: string[] = [];
    const params: unknown[] = [id, scope];
    const payload: Record<string, unknown> = { volumeId: id };

    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
      payload.name = input.name;
    }
    if (input.intent !== undefined) {
      params.push(input.intent);
      sets.push(`intent = $${params.length}`);
      payload.intent = input.intent;
    }
    if (input.role !== undefined) {
      params.push(input.role);
      sets.push(`role = $${params.length}`);
      payload.role = input.role;
    }
    if (sets.length === 0) return getVolumeInTx(tx, scope, id);

    params.push(at);
    sets.push(`updated_at = $${params.length}::timestamptz`);
    await tx.query(`UPDATE hb_volumes SET ${sets.join(", ")} WHERE id = $1 AND scope = $2`, params);
    await appendAudit(tx, id, "volume.updated", payload, at);
    return getVolumeInTx(tx, scope, id);
  });
}

/** Create or revoke a share token. Revoking is itself a sealed event. */
export async function setShareToken(
  scope: string,
  rawId: string,
  enabled: boolean,
): Promise<{ shareToken: string | null }> {
  const id = assertId(rawId, "volume");
  const db = await readyDb();
  await consume(db, scope, "write");
  const at = nowIso();

  return withTransaction(async (tx) => {
    const locked = await tx.query<{ id: string }>(
      `SELECT id FROM hb_volumes WHERE id = $1 AND scope = $2 FOR UPDATE`,
      [id, scope],
    );
    if (locked.rows.length === 0) throw notFound("No such volume in this session.");
    const token = enabled ? newShareToken() : null;
    await tx.query(
      `UPDATE hb_volumes SET share_token = $3, updated_at = $4::timestamptz WHERE id = $1 AND scope = $2`,
      [id, scope, token, at],
    );
    await appendAudit(tx, id, enabled ? "volume.shared" : "volume.unshared", { volumeId: id }, at);
    return { shareToken: token };
  });
}

/**
 * Retirement, not erasure.
 *
 * Deleting a volume leaves the rows and the audit chain in place and marks the
 * volume retired, so the seal a reader was given can still be replayed after the
 * record is gone. That tombstone is the point: a chain you cannot verify is not
 * evidence.
 */
export async function retireVolume(scope: string, rawId: string): Promise<Volume> {
  const id = assertId(rawId, "volume");

  const db = await readyDb();
  await consume(db, scope, "volume");
  const at = nowIso();

  return withTransaction(async (tx) => {
    const locked = await tx.query<{ id: string; status: string }>(
      `SELECT id, status FROM hb_volumes WHERE id = $1 AND scope = $2 FOR UPDATE`,
      [id, scope],
    );
    if (locked.rows.length === 0) throw notFound("No such volume in this session.");
    if (locked.rows[0].status === "retired") {
      throw conflict("This volume is already retired.");
    }
    await tx.query(
      `UPDATE hb_volumes SET status = 'retired', retired_at = $3::timestamptz, updated_at = $3::timestamptz
        WHERE id = $1 AND scope = $2`,
      [id, scope, at],
    );
    await appendAudit(tx, id, "volume.retired", { volumeId: id, tombstone: true }, at);
    return getVolumeInTx(tx, scope, id);
  });
}

async function getVolumeInTx(tx: SqlExecutor, scope: string, id: string): Promise<Volume> {
  const { rows } = await tx.query<VolumeRow>(`${VOLUME_SELECT} AND v.id = $3`, [
    scope,
    GENESIS_SEAL,
    id,
  ]);
  if (rows.length === 0) throw notFound("No such volume in this session.");
  return mapVolume(rows[0]);
}

export interface SheetFilters {
  status?: SheetStatus;
  classId?: ClassId;
  query?: string;
  includeDeleted?: boolean;
  limit?: number;
}

export async function listSheets(
  scope: string,
  rawVolumeId: string,
  filters: SheetFilters = {},
): Promise<Sheet[]> {
  const volumeId = assertId(rawVolumeId, "volume");
  await getVolume(scope, volumeId);
  return listSheetsByVolumeId(volumeId, filters);
}

async function listSheetsByVolumeId(volumeId: string, filters: SheetFilters = {}): Promise<Sheet[]> {
  const db = await readyDb();
  const clauses: string[] = ["volume_id = $1"];
  const params: unknown[] = [volumeId];

  if (!filters.includeDeleted) clauses.push("deleted_at IS NULL");
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filters.classId) {
    params.push(filters.classId);
    clauses.push(`mounted_class = $${params.length}`);
  }
  if (filters.query) {
    params.push(`%${filters.query.toLowerCase()}%`);
    clauses.push(`(lower(title) LIKE $${params.length} OR lower(abstract) LIKE $${params.length})`);
  }
  params.push(Math.min(Math.max(filters.limit ?? 100, 1), 200));

  const { rows } = await db.query<SheetRow>(
    `SELECT * FROM hb_sheets WHERE ${clauses.join(" AND ")}
      ORDER BY created_at ASC LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapSheet);
}

export async function getSheet(scope: string, rawSheetId: string): Promise<Sheet> {
  const sheetId = assertId(rawSheetId, "sheet");
  const db = await readyDb();
  const { rows } = await db.query<SheetRow & { scope: string }>(
    `SELECT s.*, v.scope FROM hb_sheets s JOIN hb_volumes v ON v.id = s.volume_id
      WHERE s.id = $1`,
    [sheetId],
  );
  if (rows.length === 0) throw notFound("No such sheet.");
  if (rows[0].scope !== scope) throw unauthorized();
  return mapSheet(rows[0]);
}

/**
 * Mount a record into a volume.
 *
 * The server resolves the record itself from the upstream source rather than
 * trusting metadata posted by the browser, so a sheet can only ever carry a title
 * and abstract that the source actually published. Mounting the same source twice
 * is a no-op that returns the existing sheet, which is what makes the agent's
 * idempotency key meaningful.
 */
export async function mountSheet(scope: string, rawVolumeId: string, input: MountSheetInput): Promise<{
  sheet: Sheet;
  created: boolean;
}> {
  const volumeId = assertId(rawVolumeId, "volume");
  const db = await readyDb();
  await consume(db, scope, "mount");

  const record = await resolveSource(input.sourceKind, input.sourceId);
  const affinities = affinitiesFor({ title: record.title, abstract: record.abstract });
  const mountedClass: ClassId = input.mountedClass ?? topClass(affinities);
  const determinations: Partial<Record<ClassId, number>> = {
    [mountedClass]: Math.max(0.8, affinities[mountedClass]),
  };

  const at = nowIso();
  const accession = `HB-${sha256Hex(`${volumeId}:${record.sourceKind}:${record.sourceId}`)
    .slice(0, 8)
    .toUpperCase()}`;

  return withTransaction(async (tx) => {
    const volume = await tx.query<{ id: string; status: string }>(
      `SELECT id, status FROM hb_volumes WHERE id = $1 AND scope = $2 FOR UPDATE`,
      [volumeId, scope],
    );
    if (volume.rows.length === 0) throw notFound("No such volume in this session.");
    if (volume.rows[0].status !== "active") throw conflict("This volume is retired.");

    const existing = await tx.query<SheetRow>(
      `SELECT * FROM hb_sheets WHERE volume_id = $1 AND source_kind = $2 AND source_id = $3`,
      [volumeId, record.sourceKind, record.sourceId],
    );
    if (existing.rows.length > 0) {
      return { sheet: mapSheet(existing.rows[0]), created: false };
    }

    const id = randomUUID();
    await tx.query(
      `INSERT INTO hb_sheets (
         id, volume_id, accession, source_kind, source_id, title, authors, abstract,
         url, pdf_url, host, license, published_at, citations, tier, status,
         determinations, mounted_class, provenance, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'queued',$16::jsonb,$17,$18,$19::timestamptz,$19::timestamptz)`,
      [
        id,
        volumeId,
        accession,
        record.sourceKind,
        record.sourceId,
        record.title,
        record.authors.join(AUTHOR_SEP),
        record.abstract,
        record.url,
        record.pdfUrl,
        record.host,
        record.license,
        toDbDate(record.publishedAt),
        record.citations ?? 0,
        record.tier,
        JSON.stringify(determinations),
        mountedClass,
        record.provenance,
        at,
      ],
    );
    await appendAudit(
      tx,
      volumeId,
      "sheet.mounted",
      {
        sheetId: id,
        accession,
        sourceKind: record.sourceKind,
        sourceId: record.sourceId,
        title: record.title,
        mountedClass,
        host: record.host,
        provenance: record.provenance,
        fetchedAt: record.fetchedAt,
      },
      at,
    );
    const { rows } = await tx.query<SheetRow>(`SELECT * FROM hb_sheets WHERE id = $1`, [id]);
    return { sheet: mapSheet(rows[0]), created: true };
  });
}

function topClass(affinities: Record<ClassId, number>): ClassId {
  let best: ClassId = CLASS_IDS[0];
  for (const id of CLASS_IDS) {
    if (affinities[id] > affinities[best]) best = id;
  }
  return best;
}

export async function updateSheet(
  scope: string,
  rawSheetId: string,
  input: UpdateSheetInput,
): Promise<Sheet> {
  const sheetId = assertId(rawSheetId, "sheet");
  const db = await readyDb();
  await consume(db, scope, "write");
  const at = nowIso();

  return withTransaction(async (tx) => {
    const current = await tx.query<SheetRow & { scope: string; status: string }>(
      `SELECT s.*, v.scope, v.status AS volume_status FROM hb_sheets s
         JOIN hb_volumes v ON v.id = s.volume_id
        WHERE s.id = $1 FOR UPDATE OF s`,
      [sheetId],
    );
    if (current.rows.length === 0) throw notFound("No such sheet.");
    const row = current.rows[0];
    if (row.scope !== scope) throw unauthorized();
    if (row.deleted_at) throw conflict("This sheet has been removed.");
    if (input.expectedVersion !== undefined && input.expectedVersion !== row.version) {
      throw conflict("This sheet changed since you loaded it.", {
        expectedVersion: input.expectedVersion,
        currentVersion: row.version,
      });
    }

    const sets: string[] = [];
    const params: unknown[] = [sheetId];
    const payload: Record<string, unknown> = { sheetId, accession: row.accession };

    const push = (column: string, value: unknown, key: string) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
      payload[key] = value;
    };

    if (input.status !== undefined) {
      push("status", input.status, "status");
      payload.previousStatus = row.status;
    }
    if (input.marginalia !== undefined) push("marginalia", input.marginalia, "marginaliaLength");
    if (input.decision !== undefined) push("decision", input.decision, "decision");
    if (input.decisionNote !== undefined) push("decision_note", input.decisionNote, "decisionNote");
    if (input.tier !== undefined) push("tier", input.tier, "tier");

    let determinations: Partial<Record<ClassId, number>> | null = null;
    if (input.determinations !== undefined) {
      determinations = input.determinations;
      payload.determinations = determinations;
    }

    if (sets.length === 0 && determinations === null) return mapSheet(row);

    params.push(at);
    sets.push(`updated_at = $${params.length}::timestamptz`, "version = version + 1");
    if (determinations !== null) {
      params.push(JSON.stringify({ ...(row.determinations as object), ...determinations }));
      sets.push(`determinations = $${params.length}::jsonb`);
    }

    await tx.query(`UPDATE hb_sheets SET ${sets.join(", ")} WHERE id = $1`, params);

    const eventType =
      input.decision !== undefined ? "sheet.decision" : input.status !== undefined ? "sheet.status" : "sheet.annotated";
    await appendAudit(tx, row.volume_id, eventType, payload, at);

    const { rows } = await tx.query<SheetRow>(`SELECT * FROM hb_sheets WHERE id = $1`, [sheetId]);
    return mapSheet(rows[0]);
  });
}

/** Remove a sheet as a tombstone so its audit events stay replayable. */
export async function removeSheet(scope: string, rawSheetId: string): Promise<void> {
  const sheetId = assertId(rawSheetId, "sheet");

  const db = await readyDb();
  await consume(db, scope, "mount");
  const at = nowIso();

  await withTransaction(async (tx) => {
    const current = await tx.query<SheetRow & { scope: string }>(
      `SELECT s.*, v.scope FROM hb_sheets s JOIN hb_volumes v ON v.id = s.volume_id
        WHERE s.id = $1 FOR UPDATE OF s`,
      [sheetId],
    );
    if (current.rows.length === 0) throw notFound("No such sheet.");
    const row = current.rows[0];
    if (row.scope !== scope) throw unauthorized();
    await tx.query(
      `UPDATE hb_sheets SET deleted_at = $2::timestamptz, updated_at = $2::timestamptz, version = version + 1
        WHERE id = $1`,
      [sheetId, at],
    );
    await appendAudit(
      tx,
      row.volume_id,
      "sheet.removed",
      { sheetId, accession: row.accession, tombstone: true, title: row.title },
      at,
    );
  });
}

/** Refresh a sheet's citation count from OpenAlex. A real, sealed mutation. */
export async function refreshCitations(scope: string, rawSheetId: string): Promise<Sheet> {
  const sheetId = assertId(rawSheetId, "sheet");
  const sheet = await getSheet(scope, sheetId);
  const { fetchCitationCount } = await import("./sources/openalex");
  const count = await fetchCitationCount(sheet.sourceId, sheet.sourceKind);
  if (count === null) {
    throw conflict("OpenAlex has no record for this source yet; citations left unchanged.");
  }
  return updateSheetInternal(scope, sheetId, count, sheet);
}

async function updateSheetInternal(
  scope: string,
  sheetId: string,
  citations: number,
  sheet: Sheet,
): Promise<Sheet> {
  const at = nowIso();
  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE hb_sheets SET citations = $2, updated_at = $3::timestamptz, version = version + 1
        WHERE id = $1`,
      [sheetId, citations, at],
    );
    await appendAudit(
      tx,
      sheet.volumeId,
      "sheet.enriched",
      { sheetId, accession: sheet.accession, previousCitations: sheet.citations, citations },
      at,
    );
  });
  return getSheet(scope, sheetId);
}

/** Record a reading decision. Thin wrapper so the agent and the UI agree. */
export function recordDecision(
  scope: string,
  sheetId: string,
  input: { decision: "admitted" | "deferred" | "rejected"; status?: SheetStatus; decisionNote?: string },
): Promise<Sheet> {
  return updateSheet(scope, sheetId, input);
}

/** Write marginalia. Text is stored verbatim and rendered as text. */
export function annotateSheet(
  scope: string,
  sheetId: string,
  input: { marginalia: string },
): Promise<Sheet> {
  return updateSheet(scope, sheetId, input);
}

export async function getAudit(scope: string, rawVolumeId: string): Promise<AuditEvent[]> {
  const volumeId = assertId(rawVolumeId, "volume");

  await getVolume(scope, volumeId);
  const db = await readyDb();
  const { rows } = await db.query<AuditRow>(
    `SELECT seq, event_type, payload, prev_seal, seal, created_at
       FROM hb_audit WHERE volume_id = $1 ORDER BY seq ASC`,
    [volumeId],
  );
  return rows.map(mapAudit);
}

export interface VerifyResult extends ReplayReport {
  volume: Volume;
  headStored: string;
}

export async function verifyVolume(scope: string, rawVolumeId: string): Promise<VerifyResult> {
  const volumeId = assertId(rawVolumeId, "volume");
  const volume = await getVolume(scope, volumeId);
  const events = await getAudit(scope, volumeId);
  const report = replayChain(events);
  return { ...report, volume, headStored: volume.seal };
}

export async function getWeights(scope: string): Promise<ClassWeights> {
  const db = await readyDb();
  const { rows } = await db.query<{ weights: unknown }>(
    `SELECT weights FROM hb_settings WHERE scope = $1`,
    [scope],
  );
  if (rows.length === 0) return defaultWeights();
  const stored = rows[0].weights as Partial<ClassWeights> | null;
  const base = defaultWeights();
  if (!stored || typeof stored !== "object") return base;
  for (const id of CLASS_IDS) {
    const value = stored[id];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) base[id] = value;
  }
  return base;
}

export async function saveWeights(scope: string, weights: ClassWeights): Promise<ClassWeights> {
  const db = await readyDb();
  await consume(db, scope, "write");
  await db.query(
    `INSERT INTO hb_settings (scope, weights, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (scope) DO UPDATE SET weights = $2::jsonb, updated_at = now()`,
    [scope, JSON.stringify(weights)],
  );
  return getWeights(scope);
}

/** Run the engine over a volume, optionally with live candidates to suggest. */
export async function coverageFor(
  scope: string,
  rawVolumeId: string,
  candidates: readonly EngineCandidate[] = [],
): Promise<{ volume: Volume; sheets: Sheet[]; report: CoverageReport }> {
  const volumeId = assertId(rawVolumeId, "volume");
  const volume = await getVolume(scope, volumeId);
  const sheets = await listSheets(scope, volumeId);
  const weights = await getWeights(scope);
  const report = gradeVolume({
    volumeId: volume.id,
    role: volume.role,
    sheets: sheets.map((s) => ({
      id: s.id,
      title: s.title,
      abstract: s.abstract,
      status: s.status,
      tier: s.tier,
      citations: s.citations,
      determinations: s.determinations,
    })),
    weights,
    candidates,
    referenceSeal: volume.seal,
  });
  return { volume, sheets, report };
}