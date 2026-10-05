import type { NextRequest } from "next/server";
import { getAudit } from "@/lib/service";
import { jsonWithScope, resolveRequestScope, route, NO_STORE, RouteContext } from "@/lib/http";

type Ctx = RouteContext<{ id: string }>;

/** GET /api/volumes/[id]/audit — the sealed event log, oldest first. */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const events = await getAudit(scope, id);
  return jsonWithScope(
    { count: events.length, events },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});