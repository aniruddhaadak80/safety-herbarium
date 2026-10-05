import type { NextRequest } from "next/server";
import { jsonWithScope, resolveRequestScope, route, NO_STORE } from "@/lib/http";
import { verifyBookshelf } from "@/lib/sources/bookshelf";

/**
 * GET /api/bookshelf/verify
 *
 * Live reachability check of every open-access PDF in the catalogue. Each entry
 * is probed with a bounded HEAD, falling back to a ranged GET for hosts that do
 * not implement HEAD, and the result reports status, content type and latency.
 *
 * This is a real check against the publishers' servers, not a cached flag.
 */
export const GET = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const result = await verifyBookshelf();
  return jsonWithScope(
    {
      checkedAt: result.checkedAt,
      total: result.total,
      reachable: result.reachable,
      unreachable: result.total - result.reachable,
      results: result.results,
    },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});