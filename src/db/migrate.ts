import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import {
  checksumOf,
  orderMigrationNames,
  planMigrations,
  type Migration,
} from '../migrations/plan.js'
import type { Connection } from './connect.js'

/** Where the migrations drizzle-kit generates live (ADR 0024). */
export const MIGRATIONS_DIR = 'db/migrations'

const LEDGER = sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       varchar(160) PRIMARY KEY,
    checksum   char(64)     NOT NULL,
    applied_at timestamptz  NOT NULL DEFAULT now()
  )`

/** Reads the migration directory in the order the files will run. */
export async function readMigrations(dir: string): Promise<Migration[]> {
  const names = orderMigrationNames(await readdir(dir))
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(join(dir, name), 'utf8'),
    })),
  )
}

/** Applies every pending migration in order, each in a transaction with its
 * ledger row, and returns the names that ran; a second call on an unchanged
 * tree returns nothing (R-QA-4, constitution §6). */
export async function applyMigrations(
  connection: Connection,
  dir: string = MIGRATIONS_DIR,
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
