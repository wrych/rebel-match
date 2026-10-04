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
      "VALUES (?, ?, 'Ada', 'Coach', 'Old Org', 'Healthcare', '51-250', " +
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
      sector: 'Healthcare',
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
        sector: 'Retail',
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
      sector: 'Retail',
      company_size: null,
      email: member.email,
    })
  })
})
