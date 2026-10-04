import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { connect, type Connection } from './connect.js'
import { applyMigrations } from './migrate.js'

const MIGRATIONS = 'db/migrations'

let connection: Connection

beforeEach(async () => {
  connection = await connect({ kind: 'pglite' })
})

afterEach(async () => {
  await connection.close()
})

async function scratchDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rebel-migrations-'))
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body)
  }
  return dir
}

async function tableExists(name: string): Promise<boolean> {
  const [row] = await connection.rows<{ found: string | null }>(
    sql`SELECT to_regclass(${name})::text AS found`,
  )
  return row?.found !== null
}

describe('applyMigrations on Postgres (ADR 0024)', () => {
  it('applies the migrations once, in order, then has nothing to do (R-QA-4)', async () => {
    expect(await applyMigrations(connection, MIGRATIONS)).toEqual([
      '0000_baseline.sql',
      '0001_analytics_opt_in.sql',
      '0002_setting_overrides.sql',
    ])
    expect(await applyMigrations(connection, MIGRATIONS)).toEqual([])
    expect(await tableExists('connection_requests')).toBe(true)
  })

  it('refuses a migration edited after it ran (constitution §6)', async () => {
    const dir = await scratchDir({ '0000_a.sql': 'CREATE TABLE a (x int);' })
    await applyMigrations(connection, dir)
    await writeFile(join(dir, '0000_a.sql'), 'CREATE TABLE a (y int);')

    await expect(applyMigrations(connection, dir)).rejects.toThrow()
  })

  it('rolls a failing migration back whole, ledger row included', async () => {
    const dir = await scratchDir({
      '0000_bad.sql': 'CREATE TABLE half (x int);\nSELECT * FROM nowhere;',
    })

    await expect(applyMigrations(connection, dir)).rejects.toThrow()
    expect(await tableExists('half')).toBe(false)
    const ledger = await connection.rows(
      sql`SELECT name FROM schema_migrations`,
    )
    expect(ledger).toEqual([])
  })
})

describe('the pending-request guard (R-CONN-5)', () => {
  beforeEach(async () => {
    await applyMigrations(connection, MIGRATIONS)
    await connection.db.execute(sql`
      INSERT INTO members (id, email, analytics_id) VALUES
        ('a', 'a@example.invalid', 'aa'), ('b', 'b@example.invalid', 'bb')`)
  })

  const request = (id: string, challenge: string | null): Promise<unknown> =>
    connection.db.execute(sql`
      INSERT INTO connection_requests (id, requester_id, target_id, challenge_id, kind)
      VALUES (${id}, 'a', 'b', ${challenge}, 'same_boat')`)

  it('refuses a second pending request about no challenge', async () => {
    await request('r1', null)

    await expect(request('r2', null)).rejects.toThrow()
  })

  it('lets a new request through once the first is answered', async () => {
    await request('r1', null)
    await connection.db.execute(
      sql`UPDATE connection_requests SET status = 'declined' WHERE id = 'r1'`,
    )

    await expect(request('r2', null)).resolves.toBeDefined()
  })
})
