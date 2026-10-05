import type { SqlExecutor } from "./db/client";
import { rateLimited } from "./errors";

/**
 * Abuse control for anonymous writes.
 *
 * Counters live in the database rather than in process memory, so a cold start
 * or a second serverless instance cannot reset them. The bucket key is derived
 * from the scope and the route family.
 *
 * What this is and is not: this is best-effort. On a serverless runtime, two
 * concurrent requests for a brand new bucket can both insert and the last write
 * wins, so the count can briefly under-report. It reliably stops a single
 * misbehaving client, which is the case that matters here. A hard guarantee
 * needs a hosted rate limiter (Upstash, Vercel KV or an edge limiter) wired in
 * front of these routes; the interface below is what such an adapter would
 * implement.
 */

export interface LimitRule {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Mutations allowed inside one window. */
  max: number;
}

export const LIMITS: Record<string, LimitRule> = {
  write: { windowSeconds: 60, max: 40 },
  mount: { windowSeconds: 60, max: 20 },
  volume: { windowSeconds: 300, max: 12 },
};

async function hit(db: SqlExecutor, bucket: string, rule: LimitRule): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `INSERT INTO hb_rate (bucket, count, window_start)
     VALUES ($1, 1, now())
     ON CONFLICT (bucket) DO UPDATE
       SET count = CASE
                     WHEN hb_rate.window_start < now() - ($2 || ' seconds')::interval
                       THEN 1 ELSE hb_rate.count + 1 END,
           window_start = CASE
                     WHEN hb_rate.window_start < now() - ($2 || ' seconds')::interval
                       THEN now() ELSE hb_rate.window_start END
     RETURNING count`,
    [bucket, String(rule.windowSeconds)],
  );
  return Number(rows[0]?.count ?? 1);
}

/**
 * Consume one unit of quota. Throws a 429 carrying `Retry-After` seconds when the
 * bucket is exhausted. Best-effort by design: a store failure must not take the
 * application down, so an unreachable counter fails open and is reported by the
 * health endpoint.
 */
export async function consume(
  db: SqlExecutor,
  scope: string,
  family: keyof typeof LIMITS | string,
): Promise<void> {
  const rule = LIMITS[family] ?? LIMITS.write;
  try {
    const count = await hit(db, `${family}:${scope}`, rule);
    if (count > rule.max) {
      throw rateLimited(
        `Too many ${family} requests. Try again in ${rule.windowSeconds} seconds.`,
        rule.windowSeconds,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AppError") throw error;
    // Fail open, but never silently: the health check reports counter health.
  }
}