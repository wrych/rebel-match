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
import type { Cockpit } from '../../src/services/cockpit.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const member = 'milan.horvat@example.invalid'

let db: TestDatabase
let app: ReturnType<typeof createApp>
let cookie: string
let memberId: string

async function cockpit(): Promise<Cockpit> {
  const response = await request(app).get('/api/cockpit').set('Cookie', cookie)
  return response.body as Cockpit
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [
    member,
  ])
  memberId = String(rows[0]?.['id'])
  await db.query('DELETE FROM follows WHERE member_id = ?', [memberId])
  await db.query('DELETE FROM connection_requests WHERE target_id = ?', [
    memberId,
  ])
  const session = await deps.auth.createSession(memberId)
  cookie = `${session.name}=${session.value}`
})

afterAll(async () => {
  await db.query('DELETE FROM follows WHERE member_id = ?', [memberId])
  await db.query('DELETE FROM connection_requests WHERE target_id = ?', [
    memberId,
  ])
  await db.close()
})

describe('the cockpit over Postgres (F8)', () => {
  it('lists the member’s challenge with what it found (R-MINE-1)', async () => {
    const [mine] = (await cockpit()).challenges

    expect(mine?.trend?.id).toBe('06')
    expect(mine?.counts.sameBoat).toBeGreaterThan(0)
    expect(mine?.counts.beenThere).toBeGreaterThan(0)
    expect(mine?.counts.cases).toBe(4)
  })

  it('shows what the member follows, and stops when they unfollow (R-MINE-3, F9)', async () => {
    await request(app).post('/api/follows/07').set('Cookie', cookie).expect(204)
    expect((await cockpit()).following.map((t) => t.id)).toEqual(['07'])

    await request(app)
      .delete('/api/follows/07')
      .set('Cookie', cookie)
      .expect(204)
    expect((await cockpit()).following).toEqual([])
  })

  it('counts the requests waiting for the member, for the badge (R-MINE-4)', async () => {
    const someone = await db.query(
      "SELECT id FROM members WHERE email = 'sanne.kuipers@example.invalid'",
    )
    await db.query(
      "INSERT INTO connection_requests (id, requester_id, target_id, kind) VALUES (gen_random_uuid()::text, ?, ?, 'same_boat')",
      [someone[0]?.['id'], memberId],
    )

    expect((await cockpit()).pendingIncoming).toBe(1)
  })
})
