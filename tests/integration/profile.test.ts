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
    'INSERT INTO members (id, email, name, job_title, org, sector, status, ' +
      "consent_version, consent_at, analytics_id) VALUES (?, ?, 'Ada', 'Coach', " +
      "'Old Org', 'Health', 'active', ?, now(), ?)",
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
      email: member.email,
      consentVersion: config.consentVersion,
      analyticsOptIn: false,
    })
    const body = response.body as { consentAt: string }
    expect(Date.parse(body.consentAt)).not.toBeNaN()
  })

  it('saves name, job title and organization, keeping sector and email', async () => {
    await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ name: 'Ada Rebel', jobTitle: '', org: 'New Org' })
      .expect(204)

    const [row] = await db.query(
      'SELECT name, job_title, org, sector, email FROM members WHERE id = ?',
      [member.id],
    )
    expect(row).toEqual({
      name: 'Ada Rebel',
      job_title: null,
      org: 'New Org',
      sector: 'Health',
      email: member.email,
    })
  })
})

describe('deleting your own account over Postgres (R-PROF-2)', () => {
  it('erases the member and ends their session', async () => {
    const leaver = {
      id: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
    }
    await db.query(
      'INSERT INTO members (id, email, name, status, consent_version, ' +
        "consent_at, analytics_id) VALUES (?, ?, 'Lea', 'active', ?, now(), ?)",
      [leaver.id, leaver.email, config.consentVersion, randomUUID()],
    )
    const deps = composeApp(config, db.drizzle)
    const session = await deps.auth.createSession(leaver.id)
    const theirs = `${session.name}=${session.value}`

    const response = await request(createApp(deps))
      .delete('/api/profile')
      .set('Cookie', theirs)

    expect(response.status).toBe(204)
    expect(
      await db.query('SELECT id FROM members WHERE id = ?', [leaver.id]),
    ).toEqual([])
    const after = await request(createApp(deps))
      .get('/api/profile')
      .set('Cookie', theirs)
    expect(after.status).toBe(401)
  })
})
