import { resolve } from "node:path";
import type { SqlExecutor } from "./client";

/**
 * Embedded Postgres for local development, tests and CI. A real Postgres
 * compiled to WebAssembly, so the schema, indexes, constraints and statements
 * here are the statements production runs. The data directory is gitignored and
 * disposable.
 *
 * PGlite is a single connection, so every statement is queued: without the queue
 * two concurrent requests would interleave inside one another's BEGIN/COMMIT.
 */
export async function createPgliteExecutor(): Promise<SqlExecutor> {
  const { PGlite } = await import("@electric-sql/pglite");
  const configured = process.env.PGLITE_DATA_DIR?.trim() || ".pgdata";

  /**
   * PGlite takes either a URL (`memory://`, `file://…`) or an absolute filesystem
   * path. A bare relative path is ambiguous for it, so a directory is resolved to
   * an absolute path here rather than being handed over unresolved.
   */
  const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(configured);
  const dir = isUrl
    ? configured
    : resolve(process.cwd(), configured);

  const db = await PGlite.create(dir);

  let chain: Promise<unknown> = Promise.resolve();

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = chain.then(fn, fn);
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  const direct: SqlExecutor = {
    label: "pglite-embedded",
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await db.query<T>(text, params as unknown[]);
      return { rows: result.rows ?? [] };
    },
  };

  return {
    label: "pglite-embedded",
    query<T>(text: string, params: readonly unknown[] = []) {
      return enqueue(() => direct.query<T>(text, params));
    },
    transaction<T>(fn: (exec: SqlExecutor) => Promise<T>) {
      return enqueue(async () => {
        await direct.query("BEGIN");
        try {
          const value = await fn(direct);
          await direct.query("COMMIT");
          return value;
        } catch (error) {
          try {
            await direct.query("ROLLBACK");
          } catch {
            /* the original error is the one worth surfacing */
          }
          throw error;
        }
      });
    },
  };
}