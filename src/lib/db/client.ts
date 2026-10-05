/**
 * The persistence boundary.
 *
 * One `SqlExecutor` contract, two implementations:
 *  - `neon-postgres`  production. A pooled hosted Postgres that survives
 *    redeploys and cold starts.
 *  - `pglite-embedded` local development, tests and CI. A real Postgres compiled
 *    to WebAssembly, so the schema, indexes, constraints and every statement in
 *    this project are the same statements production runs.
 *
 * A production build on Vercel without `DATABASE_URL` refuses to connect rather
 * than silently degrading to a store that vanishes on the next cold start.
 */

export type QueryResult<T> = { rows: T[] };

export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  transaction?<T>(fn: (exec: SqlExecutor) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
  label: string;
}

export type StoreKind = "neon-postgres" | "pglite-embedded";

type GlobalCache = {
  executor?: SqlExecutor;
  store?: StoreKind;
  ready?: Promise<void>;
  migrated?: Promise<void>;
};

const cache: GlobalCache = (globalThis as { __hbDb?: GlobalCache }).__hbDb ?? {};
(globalThis as { __hbDb?: GlobalCache }).__hbDb = cache;

export function onVercel(): boolean {
  return process.env.VERCEL === "1";
}

export function hasHostedDatabaseUrl(): boolean {
  const value = process.env.DATABASE_URL?.trim();
  return Boolean(value && (value.startsWith("postgres://") || value.startsWith("postgresql://")));
}

/**
 * The embedded store is allowed when explicitly opted into for local
 * verification, and never selected silently in a production runtime.
 */
export function embeddedStoreAllowed(): boolean {
  return process.env.HERBARIUM_ALLOW_EMBEDDED_STORE === "1";
}

export function storeKind(): StoreKind {
  return hasHostedDatabaseUrl() ? "neon-postgres" : "pglite-embedded";
}

export function assertStoreUsable(kind: StoreKind): void {
  if (kind === "pglite-embedded" && onVercel() && !embeddedStoreAllowed()) {
    throw new Error(
      "Refusing to run on the embedded local store in a Vercel production runtime. Set DATABASE_URL.",
    );
  }
}

async function createExecutor(): Promise<{ executor: SqlExecutor; store: StoreKind }> {
  const kind = storeKind();
  assertStoreUsable(kind);

  if (kind === "neon-postgres") {
    const { createNeonExecutor } = await import("./neon");
    return {
      executor: await createNeonExecutor(process.env.DATABASE_URL!.trim()),
      store: kind,
    };
  }
  const { createPgliteExecutor } = await import("./pglite");
  return { executor: await createPgliteExecutor(), store: kind };
}

export async function getDb(): Promise<SqlExecutor> {
  if (cache.executor) return cache.executor;
  if (!cache.ready) {
    cache.ready = createExecutor().then(({ executor, store }) => {
      cache.executor = executor;
      cache.store = store;
    });
  }
  await cache.ready;
  return cache.executor!;
}

export function activeStoreKind(): StoreKind {
  return cache.store ?? storeKind();
}

export async function withTransaction<T>(fn: (exec: SqlExecutor) => Promise<T>): Promise<T> {
  const db = await getDb();
  if (db.transaction) return db.transaction(fn);
  await db.query("BEGIN");
  try {
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      /* the transaction is gone; the original error is the useful one */
    }
    throw error;
  }
}

export async function resetDbForTests(): Promise<void> {
  if (cache.executor?.close) await cache.executor.close();
  cache.executor = undefined;
  cache.store = undefined;
  cache.ready = undefined;
  cache.migrated = undefined;
}

/**
 * Get a ready executor with the schema in place. Every route and every service
 * function goes through here, so no caller can forget the migration.
 */
export async function readyDb(): Promise<SqlExecutor> {
  const db = await getDb();
  if (!cache.migrated) {
    cache.migrated = (async () => {
      const { migrate } = await import("./schema");
      await migrate(db);
    })();
  }
  await cache.migrated;
  return db;
}