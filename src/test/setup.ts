/**
 * Test environment.
 *
 * Points the persistence adapter at an in-memory Postgres so the suite needs no
 * environment variables, no container and no network, while still exercising real
 * SQL, real constraints and real transactions.
 */
process.env.PGLITE_DATA_DIR = "memory://";
delete process.env.DATABASE_URL;
delete process.env.VERCEL;