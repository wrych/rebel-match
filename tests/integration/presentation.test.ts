import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import type { Presentation } from '../../src/services/presentation.js'
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
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
  PUBLIC_URL: 'http://localhost:5173',
  SEED_PROFILE: 'dev',
})

let db: TestDatabase
let app: ReturnType<typeof createApp>
let host: string
let member: string

async function cookieFor(
  deps: ReturnType<typeof composeApp>,
  email: string,
): Promise<string> {
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [email])
  const session = await deps.auth.createSession(String(rows[0]?.['id']))
  return `${session.name}=${session.value}`
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  host = await cookieFor(deps, DEV_ADMIN_EMAIL)
  member = await cookieFor(deps, 'milan.horvat@example.invalid')
})

afterAll(async () => {
  await db.close()
})

describe('the presentation over Postgres (R-PRES-5, R-PRES-6)', () => {
  it('places the stand-in cast on the dev seed, sending no email', async () => {
    const response = await request(app)
      .get('/api/admin/presentation')
      .set('Cookie', host)
    const body = response.body as Presentation
    const pioneer = body.cast.find((each) => each.handle === 'pioneer')
    const founder = body.cast.find((each) => each.handle === 'founder-one')

    expect(response.status).toBe(200)
    expect(pioneer?.node).toEqual(expect.any(Number))
    expect(founder?.node).toBeNull()
    expect(body.timeline.nodes.some((node) => node.self)).toBe(false)
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('is not found for a member who is not a host', async () => {
    const response = await request(app)
      .get('/api/admin/presentation')
      .set('Cookie', member)

    expect(response.status).toBe(404)
  })
})
