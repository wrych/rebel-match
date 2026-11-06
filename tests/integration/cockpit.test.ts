import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import type { TestDatabase } from './support/database.js'
import {
  cookieFor,
  idOf,
  openSeededDatabase,
  testConfig,
} from './support/app.js'
import type { Cockpit } from '../../src/services/cockpit.js'

const config = testConfig({
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
  db = await openSeededDatabase(config)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  memberId = await idOf(db, member)
  await db.query('DELETE FROM follows WHERE member_id = ?', [memberId])
  await db.query('DELETE FROM connection_requests WHERE target_id = ?', [
    memberId,
  ])
  cookie = await cookieFor(deps.auth, memberId)
})

afterAll(async () => {
  await db.query('DELETE FROM follows WHERE member_id = ?', [memberId])
  await db.query(
    'DELETE FROM connection_requests WHERE target_id = ? OR requester_id = ?',
    [memberId, memberId],
  )
  await db.query('UPDATE members SET matches_seen_at = NULL WHERE id = ?', [
    memberId,
  ])
  await db.close()
})

describe('the cockpit over Postgres (F8)', () => {
  it('lists the member’s challenge with what it found (R-MINE-1)', async () => {
    const [mine] = (await cockpit()).challenges

    expect(mine?.trend?.id).toBe('06')
    expect(mine?.counts?.sameBoat).toBeGreaterThan(0)
    expect(mine?.counts?.beenThere).toBeGreaterThan(0)
    expect(mine?.counts?.cases).toBe(4)
  })

  it('counts a peer with two challenges in the trend once (R-MINE-1, R-ASK-8)', async () => {
    const before = (await cockpit()).challenges[0]?.counts?.sameBoat
    const rows = await db.query(
      `SELECT c.member_id FROM challenges c
        WHERE c.status = 'active' AND c.member_id <> ?
          AND coalesce(c.trend_id, c.auto_trend) = '06' LIMIT 1`,
      [memberId],
    )
    const peerId = String(rows[0]?.['member_id'])
    await db.query(
      `INSERT INTO challenges (id, member_id, body, trend_id, status)
        VALUES ('c-second-of-a-peer', ?, 'A second challenge.', '06', 'active')`,
      [peerId],
    )

    try {
      expect((await cockpit()).challenges[0]?.counts?.sameBoat).toBe(before)
    } finally {
      await db.query("DELETE FROM challenges WHERE id = 'c-second-of-a-peer'")
    }
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
    const someone = await idOf(db, 'sanne.kuipers@example.invalid')
    await db.query(
      "INSERT INTO connection_requests (id, requester_id, target_id, kind) VALUES (gen_random_uuid()::text, ?, ?, 'same_boat')",
      [someone, memberId],
    )

    expect((await cockpit()).pendingIncoming).toBe(1)
  })

  it('counts only what arrived since the member opened Matches, answered or not (R-MINE-4)', async () => {
    const other = await idOf(db, 'sanne.kuipers@example.invalid')
    await db.query(
      "INSERT INTO connection_requests (id, requester_id, target_id, kind, status, responded_at) VALUES (gen_random_uuid()::text, ?, ?, 'been_there', 'accepted', now())",
      [memberId, other],
    )
    expect(await cockpit()).toMatchObject({
      pendingIncoming: 1,
      newConnections: 1,
    })

    await request(app)
      .post('/api/matches/seen')
      .set('Cookie', cookie)
      .expect(204)
    expect(await cockpit()).toMatchObject({
      pendingIncoming: 0,
      newConnections: 0,
    })
    const pending = await db.query(
      "SELECT count(*)::int AS n FROM connection_requests WHERE target_id = ? AND status = 'pending'",
      [memberId],
    )
    expect(pending[0]?.['n']).toBe(1)

    const third = await idOf(db, 'nadia.osei@example.invalid')
    await db.query(
      "INSERT INTO connection_requests (id, requester_id, target_id, kind) VALUES (gen_random_uuid()::text, ?, ?, 'same_boat')",
      [third, memberId],
    )
    expect((await cockpit()).pendingIncoming).toBe(1)
  })
})
