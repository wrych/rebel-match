import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './support/database.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
})
const member = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }

let db: TestDatabase
let app: ReturnType<typeof createApp>
let cookie: string

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query(
    'INSERT INTO members (id, email, name, job_title, org, sector, ' +
      'company_size, status, consent_version, consent_at, analytics_id) ' +
      "VALUES (?, ?, 'Ada', 'Coach', 'Old Org', 'healthcare', '51-250', " +
      "'active', ?, now(), ?)",
    [member.id, member.email, config.consentVersion, randomUUID()],
  )
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const session = await deps.auth.createSession(member.id)
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE id = ?', [member.id])
  await db.close()
})

describe('the profile over Postgres (R-PROF-1,2)', () => {
  it('shows the member their profile, email and accepted consent', async () => {
    const response = await request(app)
      .get('/api/profile')
      .set('Cookie', cookie)

    expect(response.body).toMatchObject({
      name: 'Ada',
      jobTitle: 'Coach',
      org: 'Old Org',
      sector: 'healthcare',
      companySize: '51-250',
      email: member.email,
      consentVersion: config.consentVersion,
      analyticsOptIn: false,
    })
    const body = response.body as { consentAt: string }
    expect(Date.parse(body.consentAt)).not.toBeNaN()
  })

  it('saves the profile, clearing a blank optional field, keeping email', async () => {
    await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({
        name: 'Ada Rebel',
        jobTitle: '',
        org: 'New Org',
        sector: 'retail',
        companySize: '',
      })
      .expect(204)

    const [row] = await db.query(
      'SELECT name, job_title, org, sector, company_size, email ' +
        'FROM members WHERE id = ?',
      [member.id],
    )
    expect(row).toEqual({
      name: 'Ada Rebel',
      job_title: null,
      org: 'New Org',
      sector: 'retail',
      company_size: null,
      email: member.email,
    })
  })
})

describe('deleting your own account over Postgres (R-PROF-2, ADR 0032)', () => {
  it('deactivates the member, ends their session, and their emailed link keeps it', async () => {
    const leaver = {
      id: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
    }
    await db.query(
      'INSERT INTO members (id, email, name, status, consent_version, ' +
        "consent_at, analytics_id) VALUES (?, ?, 'Lea', 'active', ?, now(), ?)",
      [leaver.id, leaver.email, config.consentVersion, randomUUID()],
    )
    // A development deployment keeps the link in the outbound log, so the
    // test can follow it as the member would from their inbox (R-MSG-4).
    const dev = loadConfig({
      DATABASE_URL: testDatabaseUrl,
      SESSION_SECRET: 'integration-session-secret-of-32-chars',
      NODE_ENV: 'development',
      MAIL_DELIVERY: 'none',
    })
    const deps = composeApp(dev, db.drizzle)
    const app = createApp(deps)
    const session = await deps.auth.createSession(leaver.id)
    const theirs = `${session.name}=${session.value}`

    const response = await request(app)
      .delete('/api/profile')
      .set('Cookie', theirs)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ eraseAfter: expect.any(String) as string })
    const [row] = await db.query('SELECT status FROM members WHERE id = ?', [
      leaver.id,
    ])
    expect(row?.['status']).toBe('deleted')
    expect(
      (await request(app).get('/api/profile').set('Cookie', theirs)).status,
    ).toBe(401)

    // Asking for a link answers as for any member; the email offers to keep it.
    const asked = await request(app)
      .post('/auth/request-link')
      .send({ email: leaver.email })
    expect(asked.body).toEqual({ state: 'check-email' })
    const [mail] = await db.query(
      'SELECT subject, body_text FROM outbox WHERE to_email = ? ORDER BY created_at DESC',
      [leaver.email],
    )
    expect(mail?.['subject']).toBe('Keep your Rebel Match account?')
    const token = /#token=([\w-]+)/.exec(String(mail?.['body_text']))?.[1]
    expect(token).toBeDefined()

    const kept = await request(app).post('/auth/verify').send({ token })

    expect(kept.status).toBe(200)
    const [back] = await db.query('SELECT status FROM members WHERE id = ?', [
      leaver.id,
    ])
    expect(back?.['status']).toBe('active')
    await db.query('DELETE FROM members WHERE id = ?', [leaver.id])
  })
})
