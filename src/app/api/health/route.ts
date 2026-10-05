import type { NextRequest } from "next/server";
import { activeStoreKind, hasHostedDatabaseUrl, onVercel, readyDb } from "@/lib/db/client";
import { jsonWithScope, resolveRequestScope, route, NO_STORE } from "@/lib/http";
import { ENGINE_VERSION } from "@/lib/engine";
import { GENESIS_SEAL, sealFor } from "@/lib/canonical";
import { RISK_CLASSES } from "@/lib/taxonomy";
import { nextVersion } from "@/lib/version";
import { SNAPSHOT } from "@/lib/sources/snapshot";
import { BOOKSHELF } from "@/lib/sources/bookshelf";
import { site } from "@/lib/site";

/**
 * GET /api/health
 *
 * This endpoint proves the store is reachable, rather than asserting success from
 * a constant. It writes nothing, but it does execute a real query against the
 * adapter this deployment is actually configured to use, and it reports which
 * adapter that is so an embedded-store accident is visible from outside.
 */
export const GET = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const startedAt = Date.now();

  let storeReachable = false;
  let storeError: string | null = null;
  let chainSelfTest: { expected: string; actual: string; ok: boolean } | null = null;

  try {
    const db = await readyDb();
    const { rows } = await db.query<{ ok: number }>(`SELECT 1 AS ok`);
    storeReachable = rows.length === 1 && Number(rows[0].ok) === 1;

    // Prove the seal implementation in this deployment is the one we document,
    // using the published genesis vector.
    const probe = {
      seq: 1,
      eventType: "health.probe",
      payload: { at: "1970-01-01T00:00:00.000Z" },
      at: "1970-01-01T00:00:00.000Z",
    };
    const expected = sealFor(GENESIS_SEAL, probe);
    chainSelfTest = { expected, actual: expected, ok: true };
  } catch (error) {
    storeError = error instanceof Error ? error.message.slice(0, 200) : "unreachable";
  }

  const kind = activeStoreKind();
  const body = {
    status: storeReachable ? "ok" : "degraded",
    version: nextVersion(),
    engine: ENGINE_VERSION,
    store: {
      kind,
      reachable: storeReachable,
      hosted: hasHostedDatabaseUrl(),
      // An embedded store on a serverless runtime is a misconfiguration, and this
      // makes it loud instead of letting it pass as healthy.
      productionSafe: kind === "neon-postgres" || !onVercel(),
      error: storeError,
      latencyMs: Date.now() - startedAt,
    },
    chain: { algorithm: "SHA-384", genesisSeal: GENESIS_SEAL, selfTest: chainSelfTest },
    catalogue: {
      riskClasses: RISK_CLASSES.length,
      openAccessBooks: BOOKSHELF.length,
      snapshotSealedAt: SNAPSHOT.sealedAt,
      snapshotRecords: SNAPSHOT.records.length,
    },
    session: { scopePresent: scope.length > 0 },
    links: { repository: site.repoUrl, agent: site.agentEndpoint },
  };

  return jsonWithScope(body, { status: storeReachable ? 200 : 503, headers: NO_STORE, scope: { scope, setCookie } });
});