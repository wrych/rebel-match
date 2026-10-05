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
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const viewer = 'priya.raman@example.invalid'

let db: TestDatabase
let deps: ReturnType<typeof composeApp>
let app: ReturnType<typeof createApp>
let cookie: string
let viewerId: string
let other: string
let own: string

async function viewsOf(memberId: string): Promise<number> {
  const rows = await db.query(
    'SELECT count(*)::int AS n FROM deck_views WHERE member_id = ?',
    [memberId],
  )
  return Number(rows[0]?.['n'])
}

const seen = (challengeId: string): request.Test =>
  request(app)
    .post('/api/deck/seen')
    .set('Cookie', cookie)
    .send({ challengeId })

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [
    viewer,
  ])
  viewerId = String(rows[0]?.['id'])
  await db.query('DELETE FROM deck_views WHERE member_id = ?', [viewerId])
  const session = await deps.auth.createSession(viewerId)
  cookie = `${session.name}=${session.value}`
  const others = await db.query(
    "SELECT id FROM challenges WHERE member_id <> ? AND status = 'active' LIMIT 1",
    [viewerId],
  )
  other = String(others[0]?.['id'])
  const mine = await db.query(
    'INSERT INTO challenges (id, member_id, body, auto_trend) ' +
      "VALUES (?, ?, 'A challenge of the viewer, long enough to stand.', '01') RETURNING id",
    [randomUUID(), viewerId],
  )
  own = String(mine[0]?.['id'])
})

afterAll(async () => {
  await db.query('DELETE FROM deck_views WHERE member_id = ?', [viewerId])
  await db.query('DELETE FROM challenges WHERE id = ?', [own])
  await db.close()
})

describe('deck views over Postgres (R-STAT-1..4, ADR 0033)', () => {
  it('records every showing of a card the deck deals', async () => {
    await seen(other).expect(204)
    await seen(other).expect(204)

    expect(await viewsOf(viewerId)).toBe(2)
  })

  it("records nothing for the member's own or an unknown challenge", async () => {
    const before = await viewsOf(viewerId)

    await seen(own).expect(404)
    await seen(randomUUID()).expect(404)

    expect(await viewsOf(viewerId)).toBe(before)
  })

  it('records nothing for a card the member already answered', async () => {
    await db.query(
      "INSERT INTO swipes (member_id, challenge_id, action) VALUES (?, ?, 'skip') " +
        'ON CONFLICT DO NOTHING',
      [viewerId, other],
    )
    const before = await viewsOf(viewerId)

    await seen(other).expect(404)

    expect(await viewsOf(viewerId)).toBe(before)
    await db.query(
      'DELETE FROM swipes WHERE member_id = ? AND challenge_id = ?',
      [viewerId, other],
    )
  })

  it('forgets the history and nothing else (R-STAT-4)', async () => {
    await seen(other).expect(204)
    await db.query(
      "INSERT INTO swipes (member_id, challenge_id, action) VALUES (?, ?, 'skip') " +
        'ON CONFLICT DO NOTHING',
      [viewerId, other],
    )

    await request(app)
      .delete('/api/me/history')
      .set('Cookie', cookie)
      .expect(204)

    expect(await viewsOf(viewerId)).toBe(0)
    const swipes = await db.query(
      'SELECT count(*)::int AS n FROM swipes WHERE member_id = ?',
      [viewerId],
    )
    expect(Number(swipes[0]?.['n'])).toBeGreaterThan(0)
    await db.query(
      'DELETE FROM swipes WHERE member_id = ? AND challenge_id = ?',
      [viewerId, other],
    )
  })

  it('goes with the member when they are erased (R-STAT-3, R-NFR-7)', async () => {
    const member = randomUUID()
    await db.query(
      "INSERT INTO members (id, email, status, analytics_id) VALUES (?, ?, 'active', ?)",
      [member, `${randomUUID()}@example.invalid`, randomUUID()],
    )
    await deps.activity.viewed(member, other)
    expect(await viewsOf(member)).toBe(1)

    await db.query('DELETE FROM members WHERE id = ?', [member])

    expect(await viewsOf(member)).toBe(0)
  })
})
