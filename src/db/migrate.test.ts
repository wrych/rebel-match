import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
      '0003_profile_lists.sql',
      '0004_erasure_grace.sql',
      '0005_outbox_about_member.sql',
      '0006_deck_views.sql',
      '0007_accept_notice.sql',
      '0008_added_connection.sql',
      '0009_invite_opens.sql',
      '0010_matches_seen.sql',
      '0011_notifications.sql',
      '0012_notification_cadences.sql',
      '0013_notification_claims.sql',
      '0014_trend_notifications.sql',
      '0015_first_onboarding.sql',
      '0016_game.sql',
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

async function copied(names: string[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const name of names)
    files[name] = await readFile(join(MIGRATIONS, name), 'utf8')
  return files
}

describe('the profile lists migration (R-ONB-2)', () => {
  it('turns a listed sector into its key and clears one off the list', async () => {
    const before = await copied([
      '0000_baseline.sql',
      '0001_analytics_opt_in.sql',
      '0002_setting_overrides.sql',
    ])
    const dir = await scratchDir(before)
    await applyMigrations(connection, dir)
    await connection.db.execute(sql`
      INSERT INTO members (id, email, analytics_id, sector) VALUES
        ('a', 'a@example.invalid', 'aa', 'Software & technology'),
        ('b', 'b@example.invalid', 'bb', 'Software · 260'),
        ('c', 'c@example.invalid', 'cc', NULL)`)
    await writeFile(
      join(dir, '0003_profile_lists.sql'),
      (await copied(['0003_profile_lists.sql']))['0003_profile_lists.sql']!,
    )

    await applyMigrations(connection, dir)

    expect(
      await connection.rows(
        sql`SELECT id, sector, company_size FROM members ORDER BY id`,
      ),
    ).toEqual([
      { id: 'a', sector: 'software-technology', company_size: null },
      { id: 'b', sector: null, company_size: null },
      { id: 'c', sector: null, company_size: null },
    ])
  })

  it('refuses a sector or company size off the lists from then on', async () => {
    await applyMigrations(connection, MIGRATIONS)

    await expect(
      connection.db.execute(sql`
        INSERT INTO members (id, email, analytics_id, sector)
        VALUES ('a', 'a@example.invalid', 'aa', 'Health')`),
    ).rejects.toThrow()
    await expect(
      connection.db.execute(sql`
        INSERT INTO members (id, email, analytics_id, company_size)
        VALUES ('a', 'a@example.invalid', 'aa', '260')`),
    ).rejects.toThrow()
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

describe('the accept notice migration (R-CONN-7)', () => {
  it('counts every connection accepted before it as already seen', async () => {
    const all = await copied([
      '0000_baseline.sql',
      '0001_analytics_opt_in.sql',
      '0002_setting_overrides.sql',
      '0003_profile_lists.sql',
      '0004_erasure_grace.sql',
      '0005_outbox_about_member.sql',
      '0006_deck_views.sql',
      '0007_accept_notice.sql',
      '0008_added_connection.sql',
    ])
    const { ['0007_accept_notice.sql']: notice, ...before } = all
    const dir = await scratchDir(before)
    await applyMigrations(connection, dir)
    await connection.db.execute(sql`
      INSERT INTO members (id, email, analytics_id) VALUES
        ('a', 'a@example.invalid', 'aa'), ('b', 'b@example.invalid', 'bb')`)
    await connection.db.execute(sql`
      INSERT INTO connection_requests
        (id, requester_id, target_id, kind, status, responded_at) VALUES
        ('r1', 'a', 'b', 'same_boat', 'accepted', now()),
        ('r2', 'a', 'b', 'same_boat', 'pending', NULL)`)
    await writeFile(join(dir, '0007_accept_notice.sql'), notice!)

    await applyMigrations(connection, dir)

    expect(
      await connection.rows(sql`
        SELECT id, requester_seen_at IS NOT NULL AS seen
        FROM connection_requests ORDER BY id`),
    ).toEqual([
      { id: 'r1', seen: true },
      { id: 'r2', seen: false },
    ])
  })
})
