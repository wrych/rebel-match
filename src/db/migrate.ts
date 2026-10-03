import { sql } from 'drizzle-orm'
import { readMigrations } from '../migrations/run.js'
import { checksumOf, planMigrations } from '../migrations/plan.js'
import type { Connection } from './connect.js'

const LEDGER = sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       varchar(160) PRIMARY KEY,
    checksum   char(64)     NOT NULL,
    applied_at timestamptz  NOT NULL DEFAULT now()
  )`

/** Applies every pending Postgres migration in order, each in a transaction
 * with its ledger row, and returns the names that ran; a second call on an
 * unchanged tree returns nothing (R-QA-4, constitution §6). */
export async function applyMigrations(
  connection: Connection,
  dir: string,
): Promise<string[]> {
  const available = await readMigrations(dir)
  await connection.db.execute(LEDGER)
  const ledger = await connection.rows<{ name: string; checksum: string }>(
    sql`SELECT name, checksum FROM schema_migrations`,
  )
  const plan = planMigrations(available, ledger)

  for (const migration of plan.toApply) {
    // Both values are safe to inline: the name passed the filename pattern
    // and the checksum is hex.
    await connection.runScript(
      `${migration.sql}\n;INSERT INTO schema_migrations (name, checksum) ` +
        `VALUES ('${migration.name}', '${checksumOf(migration.sql)}');`,
    )
  }

  return plan.toApply.map((migration) => migration.name)
}
