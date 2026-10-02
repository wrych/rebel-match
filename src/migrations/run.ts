import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import mysql from 'mysql2/promise'
import {
  checksumOf,
  orderMigrationNames,
  planMigrations,
  type AppliedMigration,
  type Migration,
} from './plan.js'

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       VARCHAR(160) NOT NULL PRIMARY KEY,
    checksum   CHAR(64)     NOT NULL,
    applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`

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

async function readLedger(
  connection: mysql.Connection,
): Promise<AppliedMigration[]> {
  await connection.query(LEDGER)
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT name, checksum FROM schema_migrations',
  )

  return rows.map((row) => ({
    name: String(row['name']),
    checksum: String(row['checksum']),
  }))
}

/** Applies every pending migration in order and records it. Returns the names
 * that ran, so a second call on an unchanged tree returns nothing (R-QA-4). */
export async function migrate(
  databaseUrl: string,
  dir: string,
): Promise<string[]> {
  const available = await readMigrations(dir)
  const connection = await mysql.createConnection({
    uri: databaseUrl,
    multipleStatements: true,
  })

  try {
    const plan = planMigrations(available, await readLedger(connection))

    for (const migration of plan.toApply) {
      await connection.query(migration.sql)
      await connection.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
        [migration.name, checksumOf(migration.sql)],
      )
    }

    return plan.toApply.map((migration) => migration.name)
  } finally {
    await connection.end()
  }
}
