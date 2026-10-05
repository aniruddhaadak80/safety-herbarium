import type { NextRequest } from "next/server";
import { setShareToken } from "@/lib/service";
import { jsonWithScope, readJson, resolveRequestScope, route, NO_STORE, RouteContext } from "@/lib/http";
import { site } from "@/lib/site";

type Ctx = RouteContext<{ id: string }>;

/**
 * POST /api/volumes/[id]/share
 *
 * Create or revoke a public, read-only link to one volume. The token is 18
 * random bytes, so the link is unguessable rather than sequential.
 *
 * Revocation is itself a sealed audit event: a public link being withdrawn is
 * part of the volume's history, not an invisible edit.
 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const body = await readJson(req);
  const enabled = body.enabled === true;
  const { shareToken } = await setShareToken(scope, id, enabled);

  return jsonWithScope(
    {
      enabled,
      shareToken,
      shareUrl: shareToken ? `${site.liveUrl}/share/${shareToken}` : null,
    },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});