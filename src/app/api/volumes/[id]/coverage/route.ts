import type { NextRequest } from "next/server";
import { coverageFor } from "@/lib/service";
import type { EngineCandidate } from "@/lib/engine";
import { fetchCandidatesForClass, toEngineCandidate } from "@/lib/sources/resolve";
import { jsonWithScope, readJson, resolveRequestScope, route, NO_STORE, RouteContext } from "@/lib/http";

type Ctx = RouteContext<{ id: string }>;

/**
 * POST /api/volumes/[id]/coverage
 *
 * Runs the deterministic engine over one volume. Send `{ "candidates": true }` to
 * also query the live arXiv index for next-read recommendations against the
 * highest-weighted open class; that costs one upstream request.
 *
 * The response carries the volume's chain head, so a report can always be tied
 * back to the state it was computed from.
 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope, setCookie } = resolveRequestScope(req);
  const body = await readJson(req);

  let candidates: EngineCandidate[] = [];
  if (body.candidates === true) {
    const probe = await coverageFor(scope, id);
    const gap = probe.report.recommendation.primaryGap;
    if (gap) {
      const live = await fetchCandidatesForClass(gap, 4);
      candidates = live.map(toEngineCandidate);
    }
  }

  const { volume, sheets, report } = await coverageFor(scope, id, candidates);
  return jsonWithScope(
    { volume, sheets, report },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});