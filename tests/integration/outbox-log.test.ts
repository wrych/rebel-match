import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openTestDatabase, type TestDatabase } from './support/database.js'
import { createOutboxLog } from '../../src/services/outbox-log-store.js'

const to = `${randomUUID()}@example.invalid`
const other = `${randomUUID()}@example.invalid`

let db: TestDatabase

async function record(
  email: string,
  status: string,
  createdAt: string,
): Promise<void> {
  await db.query(
    'INSERT INTO outbox (id, to_email, kind, subject, body_text, status, created_at) ' +
      "VALUES (?, ?, 'magic_link', 's', 'b', ?, ?)",
    [randomUUID(), email, status, createdAt],
  )
}

beforeAll(async () => {
  db = await openTestDatabase()
  await record(to, 'sent', '2026-11-08 10:00:00')
  await record(to, 'failed', '2026-11-08 11:00:00')
  await record(other, 'sent', '2026-11-08 12:00:00')
  await record(to, 'sent', '2026-01-01 00:00:00')
})

afterAll(async () => {
  await db.query('DELETE FROM outbox WHERE to_email IN (?, ?)', [to, other])
  await db.close()
})

describe('the outbound message log over Postgres', () => {
  it('lists newest first, filtered by recipient and status (R-MSG-5)', async () => {
    const log = createOutboxLog(db.drizzle)

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
      await createOutboxLog(db.drizzle).list({ to, limit: 1 }),
    ).toHaveLength(1)
  })

  it('purges only entries older than the cutoff (R-MSG-6)', async () => {
    const log = createOutboxLog(db.drizzle)

    const purged = await log.purgeBefore(new Date('2026-06-01T00:00:00Z'))

    expect(purged).toBeGreaterThanOrEqual(1)
    expect(await log.list({ to, limit: 10 })).toHaveLength(2)
    expect(await log.list({ to: other, limit: 10 })).toHaveLength(1)
  })
})
