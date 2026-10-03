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

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'development',
  MAIL_DELIVERY: 'none',
})
const welcome = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }
const turnedAway = {
  id: randomUUID(),
  email: `${randomUUID()}@example.invalid`,
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
let cookie: string

async function memberRow(id: string): Promise<Row | undefined> {
  const rows = await db.query('SELECT status FROM members WHERE id = ?', [id])
  return rows[0]
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  await db.query("UPDATE members SET status = 'active' WHERE email = ?", [
    DEV_ADMIN_EMAIL,
  ])
  for (const applicant of [welcome, turnedAway]) {
    await db.query(
      'INSERT INTO members (id, email, status, requested_name, analytics_id) ' +
        "VALUES (?, ?, 'applicant', 'Door Name', ?)",
      [applicant.id, applicant.email, randomUUID()],
    )
  }
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const admin = await db.query('SELECT id FROM members WHERE email = ?', [
    DEV_ADMIN_EMAIL,
  ])
  const session = await deps.auth.createSession(String(admin[0]?.['id']))
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await db.query('DELETE FROM outbox WHERE to_email IN (?, ?)', [
    welcome.email,
    turnedAway.email,
  ])
  await db.query('DELETE FROM members WHERE id IN (?, ?)', [
    welcome.id,
    turnedAway.id,
  ])
  await db.close()
})

describe('approving applicants over Postgres (F10)', () => {
  it('lists pending applicants with the name they gave (R-AUTH-11)', async () => {
    const response = await request(app)
      .get('/api/admin/applicants')
      .set('Cookie', cookie)

    const listed = (
      response.body as { applicants: { id: string; name: string }[] }
    ).applicants.find((applicant) => applicant.id === welcome.id)
    expect(listed).toMatchObject({ email: welcome.email, name: 'Door Name' })
  })

  it('admits, grants member and emails an approval link (R-AUTH-3,10)', async () => {
    await request(app)
      .post(`/api/admin/applicants/${welcome.id}/approve`)
      .set('Cookie', cookie)
      .expect(204)

    const roles = await db.query(
      'SELECT role_key FROM member_roles WHERE member_id = ?',
      [welcome.id],
    )
    const mail = await db.query(
      "SELECT body_text FROM outbox WHERE to_email = ? AND kind = 'approval'",
      [welcome.email],
    )
    const tokens = await db.query(
      'SELECT round(extract(epoch FROM expires_at - created_at) / 3600)::int AS hours ' +
        "FROM magic_tokens WHERE member_id = ? AND kind = 'approval'",
      [welcome.id],
    )
    expect((await memberRow(welcome.id))?.['status']).toBe('active')
    expect(roles.map((row) => String(row['role_key']))).toEqual(['member'])
    expect(String(mail[0]?.['body_text'])).toContain('/auth/verify?token=')
    expect(tokens[0]?.['hours']).toBe(config.limits.approvalLinkTtlHours)
  })

  it('does not approve the same person twice', async () => {
    await request(app)
      .post(`/api/admin/applicants/${welcome.id}/approve`)
      .set('Cookie', cookie)
      .expect(404)
  })

  it('rejects, so the login screen says not approved (R-AUTH-3,13)', async () => {
    await request(app)
      .post(`/api/admin/applicants/${turnedAway.id}/reject`)
      .set('Cookie', cookie)
      .expect(204)

    const asked = await request(app)
      .post('/auth/request-link')
      .send({ email: turnedAway.email })
    expect(asked.body).toEqual({ state: 'not-approved' })
  })
})
