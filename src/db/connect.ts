import { PGlite } from '@electric-sql/pglite'
import type { SQL } from 'drizzle-orm'
import { drizzle as onNodePostgres } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as onPglite } from 'drizzle-orm/pglite'
import pg from 'pg'
import { lockFolder } from './folder-lock.js'
import * as schema from './schema.js'

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

/** Where the data lives: a Postgres server, or PGlite in process, kept in a
 * folder or, without one, only in memory (ADR 0024). */
export type DatabaseTarget =
  { kind: 'postgres'; url: string } | { kind: 'pglite'; dataDir?: string }

export interface Connection {
  db: Database
  /** Runs one raw query and returns its rows, typed by the caller. */
  rows<T extends Record<string, unknown>>(query: SQL): Promise<T[]>
  /** Runs a script of several statements as one transaction, rolled back
   * whole if any statement fails. Only the migration runner needs this. */
  runScript(script: string): Promise<void>
  close(): Promise<void>
}

function onServer(url: string): Connection {
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  const db = onNodePostgres(pool, { schema })
  return {
    db,
    rows: async <T extends Record<string, unknown>>(query: SQL) =>
      (await db.execute(query)).rows as T[],
    runScript: async (script) => {
      const client = await pool.connect()
      try {
        await client.query(`BEGIN;\n${script}\nCOMMIT;`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

async function inProcess(dataDir?: string): Promise<Connection> {
  const release =
    dataDir === undefined ? () => Promise.resolve() : await lockFolder(dataDir)
  const client = await PGlite.create(dataDir)
  const db = onPglite(client, { schema })
  return {
    db,
    rows: async <T extends Record<string, unknown>>(query: SQL) =>
      (await db.execute(query)).rows as T[],
    runScript: async (script) => {
      try {
        await client.exec(`BEGIN;\n${script}\nCOMMIT;`)
      } catch (error) {
        await client.exec('ROLLBACK')
        throw error
      }
    },
    close: async () => {
      await client.close()
      await release()
    },
  }
}

/** Opens the database the target names. */
export function connect(target: DatabaseTarget): Promise<Connection> {
  return target.kind === 'postgres'
    ? Promise.resolve(onServer(target.url))
    : inProcess(target.dataDir)
}
