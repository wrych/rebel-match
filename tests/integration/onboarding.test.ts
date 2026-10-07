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
import { createOnboardingStore } from '../../src/services/onboarding-store.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
})
const newcomer = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }

let db: TestDatabase
let app: ReturnType<typeof createApp>
let cookie: string

beforeAll(async () => {
  db = await openTestDatabase()
  await db.query(
    'INSERT INTO members (id, email, status, requested_name, requested_org, ' +
      "analytics_id) VALUES (?, ?, 'active', 'Door Name', 'Door Org', ?)",
    [newcomer.id, newcomer.email, randomUUID()],
  )
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const session = await deps.auth.createSession(newcomer.id)
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await db.query('DELETE FROM members WHERE id = ?', [newcomer.id])
  await db.close()
})

interface Me {
  onboarded: boolean
  name: string | null
  analyticsOptIn: boolean
}

async function me(): Promise<Me> {
  const response = await request(app).get('/auth/me').set('Cookie', cookie)
  return response.body as Me
}

describe('onboarding over Postgres (F2)', () => {
  it('pre-fills from what they gave at the door, without onboarding them (R-AUTH-12)', async () => {
    const response = await request(app)
      .get('/api/onboarding')
      .set('Cookie', cookie)

    expect(response.body).toMatchObject({
      name: 'Door Name',
      org: 'Door Org',
      consentVersion: config.consentVersion,
    })
    expect(await me()).toMatchObject({ onboarded: false, name: null })
  })

  it('refuses the rest of /api until onboarded (R-NAV-7)', async () => {
    const response = await request(app)
      .get('/api/admin/applicants')
      .set('Cookie', cookie)

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'onboarding_required' })
  })

  it('records name, profile and consent, and then reads as onboarded (R-ONB-1,3)', async () => {
    await request(app)
      .post('/api/onboarding')
      .set('Cookie', cookie)
      .send({
        name: 'Ada Rebel',
        jobTitle: 'Coach',
        consentVersion: config.consentVersion,
      })
      .expect(204)

    const rows = await db.query(
      'SELECT name, job_title, org, consent_version, consent_at ' +
        'FROM members WHERE id = ?',
      [newcomer.id],
    )
    expect(rows[0]).toMatchObject({
      name: 'Ada Rebel',
      job_title: 'Coach',
      org: null,
      consent_version: config.consentVersion,
    })
    expect(Date.parse(String(rows[0]?.['consent_at']))).not.toBeNaN()
    expect(await me()).toMatchObject({ onboarded: true, name: 'Ada Rebel' })
    const admin = await request(app)
      .get('/api/admin/applicants')
      .set('Cookie', cookie)
    expect(admin.status).toBe(404)
  })

  it('records nothing for analytics until the member shares (R-ANA-4)', async () => {
    const [row] = await db.query(
      'SELECT analytics_consent_version, analytics_consent_at FROM members WHERE id = ?',
      [newcomer.id],
    )

    expect(row).toEqual({
      analytics_consent_version: null,
      analytics_consent_at: null,
    })
    expect(await me()).toMatchObject({ analyticsOptIn: false })
  })

  it('records the opt-in when the member shares on the usage step (R-ANA-4)', async () => {
    await request(app)
      .put('/api/me/analytics')
      .set('Cookie', cookie)
      .send({
        optIn: true,
        version: config.analyticsVersion,
        from: 'onboarding',
      })
      .expect(204)

    const [row] = await db.query(
      'SELECT analytics_consent_version, analytics_consent_at FROM members WHERE id = ?',
      [newcomer.id],
    )
    expect(row?.['analytics_consent_version']).toBe(config.analyticsVersion)
    expect(Date.parse(String(row?.['analytics_consent_at']))).not.toBeNaN()
    expect(await me()).toMatchObject({ analyticsOptIn: true })
  })

  it('keeps the opt-in when the member confirms the consent again (ADR 0041)', async () => {
    await request(app)
      .post('/api/onboarding')
      .set('Cookie', cookie)
      .send({ name: 'Ada Rebel', consentVersion: config.consentVersion })
      .expect(204)

    expect(await me()).toMatchObject({ onboarded: true, analyticsOptIn: true })
  })

  it('withdraws the opt-in on request (R-ANA-4)', async () => {
    await request(app)
      .put('/api/me/analytics')
      .set('Cookie', cookie)
      .send({ optIn: false })
      .expect(204)

    expect(await me()).toMatchObject({ analyticsOptIn: false })
  })

  it('reads as not onboarded again once the consent version moves on (R-ONB-4)', async () => {
    await db.query(
      "UPDATE members SET consent_version = '2000-01-01' WHERE id = ?",
      [newcomer.id],
    )

    expect(await me()).toMatchObject({ onboarded: false })
  })

  it('reads the consent version confirmed and when, for the onboarding time (R-NFR-3)', async () => {
    const store = createOnboardingStore(db.drizzle)

    expect(await store.consent(newcomer.id)).toEqual({
      version: '2000-01-01',
      acceptedAt: expect.any(Date) as Date,
    })
    expect(await store.consent(randomUUID())).toBeNull()
  })

  it('finds the latest sign-in email, for the onboarding time (R-NFR-3)', async () => {
    const email = (kind: string, at: string): Promise<unknown> =>
      db.query(
        'INSERT INTO outbox (id, member_id, to_email, kind, subject, body_text, created_at) ' +
          "VALUES (gen_random_uuid()::text, ?, ?, ?, 'S', 'B', ?)",
        [newcomer.id, newcomer.email, kind, at],
      )
    const store = createOnboardingStore(db.drizzle)
    expect(await store.signInEmailAt(newcomer.id)).toBeNull()

    await email('magic_link', '2026-11-08T09:58:00Z')
    await email('magic_link', '2026-11-08T09:59:00Z')
    await email('connection_request', '2026-11-08T10:05:00Z')

    expect(await store.signInEmailAt(newcomer.id)).toEqual(
      new Date('2026-11-08T09:59:00Z'),
    )
  })
})
