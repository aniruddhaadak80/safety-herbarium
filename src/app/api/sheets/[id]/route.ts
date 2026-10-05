import type { NextRequest } from "next/server";
import {
  getSheet,
  removeSheet,
  updateSheet,
} from "@/lib/service";
import {
  jsonWithScope,
  readJson,
  resolveRequestScope,
  route,
  NO_STORE,
  RouteContext,
} from "@/lib/http";
import {
  asBoundedInt,
  asDecision,
  asDeterminations,
  asEvidenceTier,
  asOptionalString,
  asSheetStatus,
  LIMITS,
} from "@/lib/validation";

type Ctx = RouteContext<{ id: string }>;

/** GET /api/sheets/[id] — one mounted sheet. */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const sheet = await getSheet(scope, id);
  return jsonWithScope({ sheet }, { headers: NO_STORE, scope: { scope, setCookie } });
});

/**
 * PATCH /api/sheets/[id]
 *
 * Update status, marginalia, decision, tier or manual determinations. Pass
 * `expectedVersion` for optimistic concurrency: a stale write is rejected with
 * 409 and the current version, rather than silently overwriting.
 */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const body = await readJson(req);

  const sheet = await updateSheet(scope, id, {
    ...(body.status !== undefined ? { status: asSheetStatus(body.status) } : {}),
    ...(body.marginalia !== undefined
      ? { marginalia: String(body.marginalia).slice(0, LIMITS.marginalia) }
      : {}),
    ...(body.decision !== undefined && body.decision !== null
      ? { decision: asDecision(body.decision) }
      : {}),
    ...(body.decisionNote !== undefined
      ? { decisionNote: asOptionalString(body.decisionNote, "decisionNote", LIMITS.decisionNote) ?? "" }
      : {}),
    ...(body.tier !== undefined ? { tier: asEvidenceTier(body.tier) } : {}),
    ...(body.determinations !== undefined
      ? { determinations: asDeterminations(body.determinations) }
      : {}),
    ...(body.expectedVersion !== undefined
      ? { expectedVersion: asBoundedInt(body.expectedVersion, "expectedVersion", 1, 1_000_000) }
      : {}),
  });

  return jsonWithScope({ sheet }, { headers: NO_STORE, scope: { scope, setCookie } });
});

/** DELETE /api/sheets/[id] — remove the sheet, leaving a replayable tombstone. */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  await removeSheet(scope, id);
  return jsonWithScope(
    { removed: true, sheetId: id, tombstone: true },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});