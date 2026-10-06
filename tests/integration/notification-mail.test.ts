import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp, type AppDeps } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'development',
  MAIL_DELIVERY: 'none',
  SEED_PROFILE: 'dev',
})
const people = {
  ada: 'diego.salas@example.invalid',
  bob: 'priya.raman@example.invalid',
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
let deps: AppDeps
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}

async function forget(): Promise<void> {
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [Object.values(ids), Object.values(ids)],
  )
  await db.query('DELETE FROM outbox WHERE member_id IN (?)', [
    Object.values(ids),
  ])
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  for (const [who, email] of Object.entries(people)) {
    await db.query("UPDATE members SET status = 'active' WHERE email = ?", [
      email,
    ])
    const rows = await db.query('SELECT id FROM members WHERE email = ?', [
      email,
    ])
    ids[who] = String(rows[0]?.['id'])
    const session = await deps.auth.createSession(ids[who])
    cookies[who] = `${session.name}=${session.value}`
  }
  // What earlier seeds or files left waiting is no concern of these tests.
  await db.query(
    "UPDATE notifications SET mail_status = 'skipped' WHERE mail_status = 'waiting'",
  )
})

beforeEach(forget)

afterAll(async () => {
  await forget()
  await db.close()
})

async function ask(): Promise<string> {
  const response = await request(app)
    .post('/api/connections')
    .set('Cookie', cookies['ada']!)
    .send({
      targetId: ids['bob'],
      kind: 'same_boat',
      message: 'We are living the same thing; would love to compare notes.',
    })
    .expect(201)
  return (response.body as { id: string }).id
}

async function mailed(): Promise<number> {
  const rows = await db.query(
    "SELECT count(*)::int AS n FROM outbox WHERE kind = 'connection_request' AND member_id = ?",
    [ids['bob']],
  )
  return Number(rows[0]?.['n'])
}

async function state(id: string): Promise<Record<string, unknown>> {
  const rows = await db.query(
    'SELECT mail_status, skipped_reason, mailed_cadence FROM notifications WHERE connection_id = ?',
    [id],
  )
  return rows[0] ?? {}
}

describe('the notification worker over Postgres (R-NOTE-7..11)', () => {
  it('stores the notification with the request and mails it when it runs', async () => {
    const id = await ask()
    expect(await mailed()).toBe(0)
    expect(await state(id)).toMatchObject({ mail_status: 'waiting' })

    await deps.notificationMail.deliverDue()

    expect(await mailed()).toBe(1)
    expect(await state(id)).toMatchObject({
      mail_status: 'mailed',
      mailed_cadence: 'immediately',
    })
  })

  it('mails nothing the target saw first (R-NOTE-9)', async () => {
    const id = await ask()
    await request(app)
      .get(`/api/connections/${id}`)
      .set('Cookie', cookies['bob']!)
      .expect(200)

    await deps.notificationMail.deliverDue()

    expect(await mailed()).toBe(0)
    expect(await state(id)).toMatchObject({
      mail_status: 'skipped',
      skipped_reason: 'seen',
    })
  })

  it('mails nothing about a request no longer waiting (R-NOTE-9)', async () => {
    const id = await ask()
    await db.query(
      "UPDATE connection_requests SET status = 'declined' WHERE id = ?",
      [id],
    )

    await deps.notificationMail.deliverDue()

    expect(await state(id)).toMatchObject({
      mail_status: 'skipped',
      skipped_reason: 'stale',
    })
  })

  it('mails each once, however many servers run the worker (R-NOTE-10)', async () => {
    await ask()
    const other = composeApp(config, db.drizzle)

    await Promise.all([
      deps.notificationMail.deliverDue(),
      other.notificationMail.deliverDue(),
      deps.notificationMail.deliverDue(),
    ])

    expect(await mailed()).toBe(1)
  })

  it('deletes notifications older than the retention (R-NOTE-11)', async () => {
    const id = await ask()
    await db.query(
      "UPDATE notifications SET created_at = now() - interval '91 days' WHERE connection_id = ?",
      [id],
    )

    const gone = await deps.notificationMail.purgeBefore(
      new Date(Date.now() - 90 * 86_400_000),
    )

    expect(gone).toBeGreaterThanOrEqual(1)
    expect(await state(id)).toEqual({})
  })
})
