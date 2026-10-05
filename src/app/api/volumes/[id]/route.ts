import type { NextRequest } from "next/server";
import { coverageFor, getVolume, retireVolume, updateVolume } from "@/lib/service";
import { jsonWithScope, readJson, resolveRequestScope, route, NO_STORE, RouteContext } from "@/lib/http";
import { asOptionalString, asRole, asSingleLine, LIMITS } from "@/lib/validation";

type Ctx = RouteContext<{ id: string }>;

/** GET /api/volumes/[id] — one volume with its sheets and chain head. */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const volume = await getVolume(scope, id);
  const includeReport = req.nextUrl.searchParams.get("coverage") === "1";
  if (!includeReport) {
    return jsonWithScope({ volume }, { headers: NO_STORE, scope: { scope, setCookie } });
  }
  const { sheets, report } = await coverageFor(scope, id);
  return jsonWithScope(
    { volume, sheets, report },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});

/** PATCH /api/volumes/[id] — rename, re-scope the intent, change the role. */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const body = await readJson(req);
  const volume = await updateVolume(scope, id, {
    ...(body.name !== undefined ? { name: asSingleLine(body.name, "name", LIMITS.name) } : {}),
    ...(body.intent !== undefined
      ? { intent: asOptionalString(body.intent, "intent", LIMITS.intent) ?? "" }
      : {}),
    ...(body.role !== undefined ? { role: asRole(body.role) } : {}),
  });
  return jsonWithScope({ volume }, { headers: NO_STORE, scope: { scope, setCookie } });
});

/**
 * DELETE /api/volumes/[id]
 *
 * Retires the volume and writes a tombstone rather than erasing rows, so the
 * audit chain a reader was given stays replayable after the record is gone.
 */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const volume = await retireVolume(scope, id);
  return jsonWithScope(
    { volume, tombstone: true, note: "Retired, not erased. The audit chain is still replayable." },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});

