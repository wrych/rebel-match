import { sql, type SQL } from 'drizzle-orm'
import { connect, type Database } from '../../../src/db/connect.js'
import { applyMigrations } from '../../../src/db/migrate.js'

export type Row = Record<string, unknown>

/** A migrated database for one test file: the real Postgres that
 * `DATABASE_URL` names (as in CI), or a fresh in-memory PGlite without it
 * (ADR 0024). */
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

export async function openTestDatabase(): Promise<TestDatabase> {
  const url = serverUrl()
  const connection = await connect(
    url === undefined ? { kind: 'pglite' } : { kind: 'postgres', url },
  )
  await applyMigrations(connection)
  return {
    drizzle: connection.db,
    query: (text, params = []) => connection.rows<Row>(toSql(text, params)),
    close: () => connection.close(),
  }
}
