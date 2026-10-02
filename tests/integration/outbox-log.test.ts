import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'
import { createMysqlOutboxLog } from '../../src/services/outbox-log-store.js'

const databaseUrl = process.env['DATABASE_URL']

if (databaseUrl === undefined) {
  throw new Error('integration tests need DATABASE_URL')
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
})
const to = `${randomUUID()}@example.invalid`
const other = `${randomUUID()}@example.invalid`

let pool: Pool

async function record(
  email: string,
  status: string,
  createdAt: string,
): Promise<void> {
  await pool.query(
    'INSERT INTO outbox (id, to_email, kind, subject, body_text, status, created_at) ' +
      "VALUES (?, ?, 'magic_link', 's', 'b', ?, ?)",
    [randomUUID(), email, status, createdAt],
  )
}

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
  await record(to, 'sent', '2026-11-08 10:00:00')
  await record(to, 'failed', '2026-11-08 11:00:00')
  await record(other, 'sent', '2026-11-08 12:00:00')
  await record(to, 'sent', '2026-01-01 00:00:00')
})

afterAll(async () => {
  await pool.query('DELETE FROM outbox WHERE to_email IN (?, ?)', [to, other])
  await pool.end()
})

describe('the outbound message log over MySQL', () => {
  it('lists newest first, filtered by recipient and status (R-MSG-5)', async () => {
    const log = createMysqlOutboxLog(pool)

    const mine = await log.list({ to, limit: 10 })
    const failed = await log.list({ to, status: 'failed', limit: 10 })

    expect(mine.map((row) => row.status)).toEqual(['failed', 'sent', 'sent'])
    expect(mine[0]!.createdAt.getTime()).toBeGreaterThan(
      mine[1]!.createdAt.getTime(),
    )
    expect(failed).toHaveLength(1)
  })

  it('caps the page at the limit', async () => {
    expect(
      await createMysqlOutboxLog(pool).list({ to, limit: 1 }),
    ).toHaveLength(1)
  })

  it('purges only entries older than the cutoff (R-MSG-6)', async () => {
    const log = createMysqlOutboxLog(pool)

    const purged = await log.purgeBefore(new Date('2026-06-01T00:00:00Z'))

    expect(purged).toBeGreaterThanOrEqual(1)
    expect(await log.list({ to, limit: 10 })).toHaveLength(2)
    expect(await log.list({ to: other, limit: 10 })).toHaveLength(1)
  })
})
