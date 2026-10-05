import type { SqlExecutor } from "./client";

/**
 * Hosted Postgres adapter.
 *
 * Uses the pooled `Pool` from @neondatabase/serverless so a transaction runs on
 * one dedicated connection rather than a fresh HTTP request per statement. The
 * audit chain is written inside a transaction with the row it describes, so a
 * seal can never be recorded without the state it seals.
 */
export async function createNeonExecutor(connectionString: string): Promise<SqlExecutor> {
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 30_000 });

  return {
    label: "neon-postgres",
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await pool.query(text, params as unknown[]);
      return { rows: (result.rows ?? []) as T[] };
    },
    async transaction<T>(fn: (exec: SqlExecutor) => Promise<T>) {
      const client = await pool.connect();
      const scoped: SqlExecutor = {
        label: "neon-postgres",
        query: async <R>(text: string, params: readonly unknown[] = []) => {
          const result = await client.query(text, params as unknown[]);
          return { rows: (result.rows ?? []) as R[] };
        },
      };
      try {
        await scoped.query("BEGIN");
        const value = await fn(scoped);
        await scoped.query("COMMIT");
        return value;
      } catch (error) {
        try {
          await scoped.query("ROLLBACK");
        } catch {
          /* the original error is the one worth surfacing */
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}