import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { openTestDatabase, type TestDatabase } from './support/database.js'
import { testConfig } from './support/app.js'

const base = {
  NODE_ENV: 'development',
}
const SCHEDULER = 'Bearer scheduler-token'
const to = `${randomUUID()}@example.invalid`

let db: TestDatabase

async function logged(): Promise<number> {
  const rows = await db.query('SELECT id FROM outbox WHERE to_email = ?', [to])
  return rows.length
}

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query(
    'INSERT INTO outbox (id, to_email, kind, subject, body_text, status, created_at) ' +
      "VALUES (?, ?, 'magic_link', 's', 'b', 'sent', '2020-01-01 00:00:00')",
    [randomUUID(), to],
  )
})

afterAll(async () => {
  await db.query('DELETE FROM outbox WHERE to_email = ?', [to])
  await db.close()
})

describe('the tick, composed as the server runs it (ADR 0049)', () => {
  function tickApp(): ReturnType<typeof createApp> {
    const config = testConfig({
      ...base,
      SCHEDULED_WORK: 'tick',
      TICK_INVOKER: 'scheduler-tick@p.iam.gserviceaccount.com',
      TICK_AUDIENCE: 'https://rebel-match-1.europe-west6.run.app',
    })
    const deps = composeApp(config, db.drizzle)
    const scheduled = deps.scheduled
    if (scheduled === undefined) throw new Error('tick mode composed no tick')
    return createApp({
      ...deps,
      scheduled: {
        ...scheduled,
        isInvoker: (authorization) =>
          Promise.resolve(authorization === SCHEDULER),
      },
    })
  }

  it('answers anyone but the scheduler not found, and purges nothing', async () => {
    await request(tickApp())
      .post('/api/internal/tick')
      .set('Authorization', 'Bearer forged')
      .expect(404)

    expect(await logged()).toBe(1)
  })

  it("runs the server's scheduled work for the scheduler", async () => {
    await request(tickApp())
      .post('/api/internal/tick')
      .set('Authorization', SCHEDULER)
      .expect(204)

    expect(await logged()).toBe(0)
  })

  it('has no tick while the timers run the work', async () => {
    const app = createApp(composeApp(testConfig(base), db.drizzle))

    await request(app)
      .post('/api/internal/tick')
      .set('Authorization', SCHEDULER)
      .expect(401)
  })
})
