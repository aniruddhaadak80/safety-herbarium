import type { NextRequest } from "next/server";
import { listSheets, mountSheet } from "@/lib/service";
import { jsonWithScope, readJson, resolveRequestScope, route, NO_STORE, stringParam, RouteContext } from "@/lib/http";
import { asClassId, asSheetStatus, asSourceKind, asSourceRef } from "@/lib/validation";
import { isClassId } from "@/lib/sources/queries";
import { badRequest } from "@/lib/errors";

type Ctx = RouteContext<{ id: string }>;

/**
 * GET /api/volumes/[id]/sheets
 *
 * Filters and a search string live in the query so a filtered view is
 * shareable and survives a refresh. Bounded to 200 rows.
 */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);

  const statusParam = stringParam(req, "status", 16);
  if (statusParam) asSheetStatus(statusParam);

  const classParam = stringParam(req, "class", 48);
  if (classParam && !isClassId(classParam)) {
    throw badRequest("Unknown risk class in filter.", { classId: classParam });
  }

  const sheets = await listSheets(scope, id, {
    ...(statusParam ? { status: statusParam as ReturnType<typeof asSheetStatus> } : {}),
    ...(classParam ? { classId: classParam as ReturnType<typeof asClassId> } : {}),
    ...(stringParam(req, "q", 120) ? { query: stringParam(req, "q", 120) } : {}),
  });
  return jsonWithScope(
    { count: sheets.length, sheets },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});

/** POST /api/volumes/[id]/sheets — mount a paper or an open-access book. */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const body = await readJson(req);
  const sourceKind = asSourceKind(body.sourceKind);
  const ref = asSourceRef(sourceKind, body.sourceId);
  const mountedClass = body.mountedClass === undefined ? undefined : asClassId(body.mountedClass);

  const { sheet, created } = await mountSheet(scope, id, {
    sourceKind: ref.kind,
    sourceId: ref.id,
    ...(mountedClass ? { mountedClass } : {}),
    ...(typeof body.idempotencyKey === "string"
      ? { idempotencyKey: body.idempotencyKey.slice(0, 64) }
      : {}),
  });

  return jsonWithScope(
    { sheet, created },
    { status: created ? 201 : 200, headers: NO_STORE, scope: { scope, setCookie } },
  );
});