import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import { inject } from 'vitest'
import {
  connect,
  onClient,
  type Connection,
  type Database,
} from '../../../src/db/connect.js'
import { applyMigrations } from '../../../src/db/migrate.js'

export type Row = Record<string, unknown>

/** A migrated database for one test file: on the Postgres `DATABASE_URL`
 * names (as in CI), or without it an in-memory PGlite loaded from the run's
 * migrated snapshot (ADR 0024). */
export interface TestDatabase {
  drizzle: Database
  /** Raw SQL for setting up and checking state, with `?` placeholders. An
   * array argument expands in place, so `IN (?)` takes a list. */
  query(text: string, params?: unknown[]): Promise<Row[]>
  close(): Promise<void>
}

/** The Postgres to test against, if any. Empty counts as none, so a push
 * hook can send the suite to PGlite past a URL that .env still sets. */
export function serverUrl(): string | undefined {
  const url = process.env['DATABASE_URL']
  return url === undefined || url === '' ? undefined : url
}

/** Placeholder for configuration, which wants a URL even when the tests run
 * on PGlite and never read it. */
export const testDatabaseUrl =
  serverUrl() ?? 'postgres://pglite.invalid/in-memory'

function toSql(text: string, params: readonly unknown[]): SQL {
  const parts = text.split('?')
  if (parts.length - 1 !== params.length) {
    throw new Error(`${String(params.length)} params for: ${text}`)
  }
  const chunks: SQL[] = [sql.raw(parts[0] ?? '')]
  params.forEach((param, index) => {
    chunks.push(
      Array.isArray(param)
        ? sql.join(
            param.map((item: unknown) => sql`${item}`),
            sql`, `,
          )
        : sql`${param}`,
      sql.raw(parts[index + 1] ?? ''),
    )
  })
  return sql.join(chunks)
}

async function fromSnapshot(): Promise<Connection | undefined> {
  const snapshot = inject('pgliteSnapshot')
  if (snapshot === undefined) return undefined
  const loadDataDir = new Blob([await readFile(snapshot)])
  return onClient(await PGlite.create({ loadDataDir }))
}

export async function openTestDatabase(): Promise<TestDatabase> {
  const url = serverUrl()
  const connection =
    url === undefined
      ? ((await fromSnapshot()) ?? (await connect({ kind: 'pglite' })))
      : await connect({ kind: 'postgres', url })
  // Finds nothing to do on a migrated copy or snapshot, only on a fresh one.
  await applyMigrations(connection)
  return {
    drizzle: connection.db,
    query: (text, params = []) => connection.rows<Row>(toSql(text, params)),
    close: () => connection.close(),
  }
}
