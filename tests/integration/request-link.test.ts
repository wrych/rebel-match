import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type Row,
  type TestDatabase,
} from './support/database.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import { createApplicantHandles } from '../../src/services/applicant-handle.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'development',
  MAIL_DELIVERY: 'none',
})
const stranger = `${randomUUID()}@example.invalid`
const refused = `${randomUUID()}@example.invalid`
const member = 'sanne.kuipers@example.invalid'

let db: TestDatabase
let app: ReturnType<typeof createApp>
let strangerHandle: string
let deliverDue: () => Promise<void>

// What the outbound log holds once the notification worker has run, as the
// server's timer runs it (R-NOTE-7).
async function outboxFor(to: string, kind: string): Promise<Row[]> {
  await deliverDue()
  const rows = await db.query(
    'SELECT * FROM outbox WHERE to_email = ? AND kind = ?',
    [to, kind],
  )
  return rows
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  await db.query("UPDATE members SET status = 'active' WHERE email IN (?, ?)", [
    DEV_ADMIN_EMAIL,
    member,
  ])
  await db.query("DELETE FROM outbox WHERE kind = 'admin_notice'")
  const deps = composeApp(config, db.drizzle)
  deliverDue = () => deps.notificationMail.deliverDue()
  app = createApp(deps)
})

afterAll(async () => {
  await db.query("DELETE FROM outbox WHERE kind = 'admin_notice'")
  await db.query('DELETE FROM members WHERE email IN (?, ?)', [
    stranger,
    refused,
  ])
  await db.close()
})

describe('POST /auth/request-link over Postgres', () => {
  it('emails a whitelisted member a link (R-AUTH-4)', async () => {
    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: member })

    expect(response.body).toEqual({ state: 'check-email' })
    expect((await outboxFor(member, 'magic_link')).length).toBeGreaterThan(0)
  })

  it('records a stranger as an applicant and tells the reviewers (R-AUTH-2)', async () => {
    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: stranger })

    const rows = await db.query('SELECT status FROM members WHERE email = ?', [
      stranger,
    ])
    const notices = await outboxFor(DEV_ADMIN_EMAIL, 'admin_notice')
    strangerHandle = (response.body as { handle: string }).handle

    expect(response.body).toMatchObject({ state: 'access-requested' })
    expect(strangerHandle).toEqual(expect.any(String))
    expect(rows[0]?.['status']).toBe('applicant')
    expect(notices).toHaveLength(1)
    expect(String(notices[0]?.['body_text'])).toContain(stranger)
    expect(await outboxFor(stranger, 'magic_link')).toHaveLength(0)
  })

  it('does not repeat the notice when the applicant asks again (F4)', async () => {
    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: stranger })

    expect(response.body).toEqual({ state: 'access-requested' })
    expect(await outboxFor(DEV_ADMIN_EMAIL, 'admin_notice')).toHaveLength(1)
  })

  it('lets the applicant add a name and org with their handle (R-AUTH-11,12)', async () => {
    const handle = strangerHandle

    await request(app)
      .post('/auth/applicant')
      .send({ handle, name: 'Ada Rebel' })
      .expect(204)
    await request(app)
      .post('/auth/applicant')
      .send({ handle, org: 'Rebels' })
      .expect(204)

    const rows = await db.query(
      'SELECT requested_name, requested_org FROM members WHERE email = ?',
      [stranger],
    )
    expect(rows[0]).toEqual({
      requested_name: 'Ada Rebel',
      requested_org: 'Rebels',
    })
  })

  it('refuses to describe a member who is no longer pending', async () => {
    const handle = createApplicantHandles(config.sessionSecret).issue(member)

    await request(app)
      .post('/auth/applicant')
      .send({ handle, name: 'Someone else' })
      .expect(404)
  })

  it('tells a rejected applicant plainly, sending and notifying nothing (R-AUTH-13)', async () => {
    await db.query(
      "INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, 'rejected', ?)",
      [randomUUID(), refused, randomUUID()],
    )
    const before = (await outboxFor(DEV_ADMIN_EMAIL, 'admin_notice')).length

    const response = await request(app)
      .post('/auth/request-link')
      .send({ email: refused })

    expect(response.body).toEqual({ state: 'not-approved' })
    expect(await outboxFor(refused, 'magic_link')).toHaveLength(0)
    expect(await outboxFor(DEV_ADMIN_EMAIL, 'admin_notice')).toHaveLength(
      before,
    )
  })
})
