import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RowDataPacket } from 'mysql2/promise'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'

const databaseUrl = process.env['DATABASE_URL']

if (databaseUrl === undefined) {
  throw new Error('integration tests need DATABASE_URL')
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
})
const newcomer = { id: randomUUID(), email: `${randomUUID()}@example.invalid` }

let pool: Pool
let app: ReturnType<typeof createApp>
let cookie: string

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
  await pool.query(
    'INSERT INTO members (id, email, status, requested_name, requested_org, ' +
      "analytics_id) VALUES (?, ?, 'active', 'Door Name', 'Door Org', ?)",
    [newcomer.id, newcomer.email, randomUUID()],
  )
  const deps = composeApp(config, pool)
  app = createApp(deps)
  const session = await deps.auth.createSession(newcomer.id)
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await pool.query('DELETE FROM members WHERE id = ?', [newcomer.id])
  await pool.end()
})

async function me(): Promise<{ onboarded: boolean; name: string | null }> {
  const response = await request(app).get('/auth/me').set('Cookie', cookie)
  return response.body as { onboarded: boolean; name: string | null }
}

describe('onboarding over MySQL (F2)', () => {
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

    const [rows] = await pool.query<RowDataPacket[]>(
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
    expect(rows[0]?.['consent_at']).toBeInstanceOf(Date)
    expect(await me()).toMatchObject({ onboarded: true, name: 'Ada Rebel' })
  })

  it('reads as not onboarded again once the consent version moves on (R-ONB-4)', async () => {
    await pool.query(
      "UPDATE members SET consent_version = '2000-01-01' WHERE id = ?",
      [newcomer.id],
    )

    expect(await me()).toMatchObject({ onboarded: false })
  })
})
