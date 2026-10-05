import type { NextRequest } from "next/server";
import { getWeights, saveWeights } from "@/lib/service";
import { jsonWithScope, readJson, resolveRequestScope, route, NO_STORE } from "@/lib/http";
import { asUnit } from "@/lib/validation";
import { RISK_CLASSES, defaultWeights, SATURATION, TIER_WEIGHT, STATUS_WEIGHT, GAP_THRESHOLD } from "@/lib/taxonomy";
import { ENGINE_VERSION } from "@/lib/engine";
import { scopeFingerprint } from "@/lib/session";

/** GET /api/settings — engine weights, the documented constants, session scope. */
export const GET = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const weights = await getWeights(scope);
  return jsonWithScope(
    {
      weights,
      constants: {
        engine: ENGINE_VERSION,
        saturation: SATURATION,
        gapThreshold: GAP_THRESHOLD,
        tierWeight: TIER_WEIGHT,
        statusWeight: STATUS_WEIGHT,
      },
      classes: RISK_CLASSES.map((c) => ({ id: c.id, code: c.code, label: c.label, blurb: c.blurb })),
      session: { fingerprint: scopeFingerprint(scope), ownedBy: "anonymous http-only cookie" },
    },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});

/** PATCH /api/settings — tilt the per-class priors the score is weighted by. */
export const PATCH = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const body = await readJson(req);
  const incoming = (body.weights ?? {}) as Record<string, unknown>;
  const next = defaultWeights();
  for (const riskClass of RISK_CLASSES) {
    if (incoming[riskClass.id] !== undefined) {
      next[riskClass.id] = asUnit(incoming[riskClass.id], `weights.${riskClass.id}`);
    }
  }
  const weights = await saveWeights(scope, next);
  return jsonWithScope({ weights }, { headers: NO_STORE, scope: { scope, setCookie } });
});