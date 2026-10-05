import type { NextRequest } from "next/server";
import { verifyVolume } from "@/lib/service";
import { jsonWithScope, resolveRequestScope, route, NO_STORE, RouteContext } from "@/lib/http";

type Ctx = RouteContext<{ id: string }>;

/**
 * GET /api/volumes/[id]/verify
 *
 * Recomputes every seal from the stored events and reports the first broken link.
 * This is the endpoint a sceptic points a seal at: it never trusts the stored
 * `seal` column, it only compares.
 */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const report = await verifyVolume(scope, id);
  return jsonWithScope(
    {
      ok: report.ok,
      events: report.events,
      brokenAtSeq: report.brokenAtSeq,
      reason: report.reason,
      headSeal: report.headSeal,
      headStored: report.headStored,
      headMatches: report.headSeal === report.headStored,
      volume: { id: report.volume.id, name: report.volume.name, status: report.volume.status },
    },
    { status: report.ok ? 200 : 409, headers: NO_STORE, scope: { scope, setCookie } },
  );
});