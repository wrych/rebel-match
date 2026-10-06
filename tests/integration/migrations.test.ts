import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect, type Connection } from '../../src/db/connect.js'
import { applyMigrations, readMigrations } from '../../src/db/migrate.js'
import { serverUrl } from './support/database.js'

const url = serverUrl()
let connection: Connection

async function tableNames(): Promise<string[]> {
  const rows = await connection.rows<{ t: string }>(
    sql`SELECT table_name AS t FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`,
  )
  return rows.map((row) => row.t)
}

// Every file shares CI's database, so this one leaves it empty for the next.
async function dropEverything(): Promise<void> {
  await connection.runScript(
    'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
  )
}

describe('migrations', () => {
  beforeAll(async () => {
    connection = await connect(
      url === undefined ? { kind: 'pglite' } : { kind: 'postgres', url },
    )
    await dropEverything()
  })
  afterAll(async () => {
    await dropEverything()
    await connection.close()
  })

  it('runs from an empty database (R-QA-4)', async () => {
    const applied = await applyMigrations(connection)
    const expected = (await readMigrations('db/migrations')).map((m) => m.name)

    expect(applied).toEqual(expected)
  })

  it('creates every table the login and ask journeys need', async () => {
    expect(await tableNames()).toEqual([
      'cases',
      'challenges',
      'company_sizes',
      'connection_requests',
      'deck_views',
      'follows',
      'invite_opens',
      'invites',
      'magic_tokens',
      'member_expertise',
      'member_roles',
      'members',
      'notification_settings',
      'notifications',
      'outbox',
      'outbox_quotes',
      'roles',
      'schema_migrations',
      'sectors',
      'sessions',
      'setting_overrides',
      'swipes',
      'trends',
    ])
  })

  it('is a no-op when run again, so deploys are idempotent', async () => {
    expect(await applyMigrations(connection)).toEqual([])
  })

  it('refuses to run when an applied migration has been edited', async () => {
    await connection.db.execute(
      sql`UPDATE schema_migrations SET checksum = 'tampered'
          WHERE name = '0000_baseline.sql'`,
    )

    await expect(applyMigrations(connection)).rejects.toThrow(
      /already ran and have since been edited/,
    )
  })
})
