import type { NextRequest } from "next/server";
import { refreshCitations } from "@/lib/service";
import { jsonWithScope, resolveRequestScope, route, NO_STORE, RouteContext } from "@/lib/http";

type Ctx = RouteContext<{ id: string }>;

/**
 * POST /api/sheets/[id]/citations
 *
 * Re-reads the citation count for a mounted arXiv preprint from OpenAlex and
 * records the change as a sealed audit event, so the weight the engine gives a
 * paper is traceable rather than magic.
 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const sheet = await refreshCitations(scope, id);
  return jsonWithScope({ sheet, source: "OpenAlex" }, { headers: NO_STORE, scope: { scope, setCookie } });
});