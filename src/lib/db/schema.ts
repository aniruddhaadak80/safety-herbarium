import type { SqlExecutor } from "./client";

/**
 * Schema, indexes and idempotent first-run migration.
 *
 * Runs the same SQL on both adapters, because PGlite is a real Postgres. All
 * statements are `IF NOT EXISTS`, so booting the app is the migration. Table
 * names are prefixed `hb_` so this project can share a database with another
 * deployment without collision.
 */

const STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS hb_volumes (
     id           uuid PRIMARY KEY,
     scope        text NOT NULL,
     name         text NOT NULL,
     intent       text NOT NULL DEFAULT '',
     role         text NOT NULL,
     status       text NOT NULL DEFAULT 'active',
     share_token  text,
     created_at   timestamptz NOT NULL DEFAULT now(),
     updated_at   timestamptz NOT NULL DEFAULT now(),
     retired_at   timestamptz,
     CONSTRAINT hb_volumes_role_check CHECK (role IN ('student','researcher','engineer','policy','generalist')),
     CONSTRAINT hb_volumes_status_check CHECK (status IN ('active','retired'))
   )`,
  `CREATE INDEX IF NOT EXISTS hb_volumes_scope_idx ON hb_volumes (scope, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hb_volumes_share_idx ON hb_volumes (share_token) WHERE share_token IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS hb_sheets (
     id             uuid PRIMARY KEY,
     volume_id      uuid NOT NULL REFERENCES hb_volumes(id) ON DELETE CASCADE,
     accession      text NOT NULL,
     source_kind    text NOT NULL,
     source_id      text NOT NULL,
     title          text NOT NULL,
     authors        text NOT NULL DEFAULT '',
     abstract       text NOT NULL DEFAULT '',
     url            text NOT NULL,
     pdf_url        text,
     host           text NOT NULL,
     license        text,
     published_at   date,
     citations      integer NOT NULL DEFAULT 0,
     tier           text NOT NULL,
     status         text NOT NULL DEFAULT 'queued',
     marginalia     text NOT NULL DEFAULT '',
     determinations jsonb NOT NULL DEFAULT '{}'::jsonb,
     mounted_class  text NOT NULL,
     decision       text,
     decision_note  text NOT NULL DEFAULT '',
     provenance     text NOT NULL DEFAULT 'live',
     version        integer NOT NULL DEFAULT 1,
     deleted_at     timestamptz,
     created_at     timestamptz NOT NULL DEFAULT now(),
     updated_at     timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT hb_sheets_kind_check CHECK (source_kind IN ('arxiv','book')),
     CONSTRAINT hb_sheets_status_check CHECK (status IN ('queued','reading','read','parked','rejected')),
     CONSTRAINT hb_sheets_tier_check CHECK (tier IN ('monograph','standard','survey','empirical','theoretical','position')),
     CONSTRAINT hb_sheets_decision_check CHECK (decision IS NULL OR decision IN ('admitted','deferred','rejected')),
     CONSTRAINT hb_sheets_provenance_check CHECK (provenance IN ('live','curated','fallback')),
     CONSTRAINT hb_sheets_citations_check CHECK (citations >= 0),
     CONSTRAINT hb_sheets_mounted_class_check CHECK (mounted_class IN ('deceptive_alignment','reward_misspecification','scalable_oversight','interpretability','value_uncertainty','corrigibility','power_seeking','robustness_fragility','evaluation_rigor','governance_assurance'))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hb_sheets_source_idx ON hb_sheets (volume_id, source_kind, source_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hb_sheets_accession_idx ON hb_sheets (volume_id, accession)`,
  `CREATE INDEX IF NOT EXISTS hb_sheets_volume_idx ON hb_sheets (volume_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS hb_audit (
     volume_id   uuid NOT NULL REFERENCES hb_volumes(id) ON DELETE CASCADE,
     seq         integer NOT NULL,
     event_type  text NOT NULL,
     payload     jsonb NOT NULL,
     prev_seal   text NOT NULL,
     seal        text NOT NULL,
     created_at  timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (volume_id, seq)
   )`,
  `CREATE INDEX IF NOT EXISTS hb_audit_volume_idx ON hb_audit (volume_id, seq)`,

  `CREATE TABLE IF NOT EXISTS hb_settings (
     scope      text PRIMARY KEY,
     weights    jsonb NOT NULL,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS hb_rate (
     bucket       text PRIMARY KEY,
     count        integer NOT NULL,
     window_start timestamptz NOT NULL
   )`,
];

let migrated = false;

export async function migrate(db: SqlExecutor): Promise<void> {
  if (migrated) return;
  for (const statement of STATEMENTS) {
    await db.query(statement);
  }
  migrated = true;
}

/** Test hook: forget that migration ran, so a fresh schema can be built. */
export function resetMigrationForTests(): void {
  migrated = false;
}