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
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
  MEMBER_SEARCH: '1',
  DIRECT_REQUESTS_PER_DAY: '1',
})
const people = {
  tobias: 'tobias.renner@example.invalid',
  ana: 'ana.ferreira@example.invalid',
  priya: 'priya.raman@example.invalid',
}

let db: TestDatabase
let app: ReturnType<typeof createApp>
const ids: Record<string, string> = {}
const cookies: Record<string, string> = {}

async function clear(): Promise<void> {
  await db.query(
    'DELETE FROM connection_requests WHERE requester_id IN (?) OR target_id IN (?)',
    [Object.values(ids), Object.values(ids)],
  )
  await db.query('UPDATE members SET findable = true WHERE id IN (?)', [
    Object.values(ids),
  ])
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  for (const [who, email] of Object.entries(people)) {
    const rows = await db.query('SELECT id FROM members WHERE email = ?', [
      email,
    ])
    ids[who] = String(rows[0]?.['id'])
    const session = await deps.auth.createSession(ids[who])
    cookies[who] = `${session.name}=${session.value}`
  }
  await clear()
})

afterAll(async () => {
  await clear()
  await db.close()
})

const send = (from: string, to: string): request.Test =>
  request(app)
    .post('/api/connections')
    .set('Cookie', cookies[from] ?? '')
    .send({ targetId: ids[to], kind: 'direct', message: 'We met at lunch' })

describe('direct requests (R-FIND-7, F25)', () => {
  it('stores a pending request about no challenge, then caps the day', async () => {
    const first = await send('tobias', 'ana')
    const over = await send('tobias', 'priya')

    expect(first.status).toBe(201)
    expect(over.status).toBe(429)
    const rows = await db.query(
      'SELECT kind, status, challenge_id FROM connection_requests WHERE requester_id = ?',
      [ids['tobias']],
    )
    expect(rows).toEqual([
      { kind: 'direct', status: 'pending', challenge_id: null },
    ])
  })

  it('answers not found for a member who turned findable off', async () => {
    await db.query('UPDATE members SET findable = false WHERE id = ?', [
      ids['priya'],
    ])

    const response = await send('ana', 'priya')

    expect(response.status).toBe(404)
  })

  it('goes through the double opt-in: accepted, then the contact reads', async () => {
    const [pending] = await db.query(
      'SELECT id FROM connection_requests WHERE requester_id = ?',
      [ids['tobias']],
    )
    const id = String(pending?.['id'])

    const accepted = await request(app)
      .post(`/api/connections/${id}/accept`)
      .set('Cookie', cookies['ana'] ?? '')
    const contact = await request(app)
      .get(`/api/connections/${id}/contact`)
      .set('Cookie', cookies['tobias'] ?? '')

    expect(accepted.status).toBe(204)
    expect(contact.status).toBe(200)
    const body = contact.body as { contact: { over: unknown[] } }
    expect(body.contact.over).toMatchObject([
      { kind: 'direct', challenge: null },
    ])
  })
})
