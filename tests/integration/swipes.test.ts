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
let app: ReturnType<typeof createApp>
let cookie: string
let viewerId: string
let cards: { id: string; author: string; trend: string }[]

async function cleanup(): Promise<void> {
  await db.query('DELETE FROM swipes WHERE member_id = ?', [viewerId])
  await db.query('DELETE FROM follows WHERE member_id = ?', [viewerId])
  await db.query('DELETE FROM connection_requests WHERE requester_id = ?', [
    viewerId,
  ])
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [
    viewer,
  ])
  viewerId = String(rows[0]?.['id'])
  await cleanup()
  const session = await deps.auth.createSession(viewerId)
  cookie = `${session.name}=${session.value}`
  const others = await db.query(
    'SELECT id, member_id, COALESCE(trend_id, auto_trend) AS trend FROM challenges ' +
      'WHERE member_id <> ? ORDER BY created_at LIMIT 3',
    [viewerId],
  )
  cards = others.map((r) => ({
    id: String(r['id']),
    author: String(r['member_id']),
    trend: String(r['trend']),
  }))
})

afterAll(async () => {
  await cleanup()
  await db.close()
})

function swipe(body: object): request.Test {
  return request(app).post('/api/swipe').set('Cookie', cookie).send(body)
}

describe('swiping over Postgres (F6)', () => {
  it('turns been there into a pending request to the author, with the note (R-OFF-3,4)', async () => {
    const note =
      'We removed approval loops one by one; I can share the log we kept.'
    const card = cards[0]!

    const response = await swipe({
      challengeId: card.id,
      action: 'been_there',
      note,
    })

    const rows = await db.query(
      'SELECT target_id, kind, message, status FROM connection_requests ' +
        'WHERE requester_id = ? AND challenge_id = ?',
      [viewerId, card.id],
    )
    expect(response.status).toBe(201)
    expect(rows[0]).toEqual({
      target_id: card.author,
      kind: 'been_there',
      message: note,
      status: 'pending',
    })
  })

  it('follows the trend of a followed card (R-OFF-3)', async () => {
    const card = cards[1]!

    await swipe({ challengeId: card.id, action: 'follow' }).expect(201)

    const rows = await db.query(
      'SELECT 1 FROM follows WHERE member_id = ? AND trend_id = ?',
      [viewerId, card.trend],
    )
    expect(rows).toHaveLength(1)
  })

  it('takes swiped cards out of the deck (R-OFF-2)', async () => {
    await swipe({ challengeId: cards[2]!.id, action: 'skip' }).expect(201)

    const deck = await request(app).get('/api/deck').set('Cookie', cookie)
    const dealt = (deck.body as { cards: { challengeId: string }[] }).cards.map(
      (c) => c.challengeId,
    )
    for (const card of cards) expect(dealt).not.toContain(card.id)
  })

  it("refuses to swipe the viewer's own challenge (R-OFF-1)", async () => {
    const own = await db.query(
      'SELECT id FROM challenges WHERE member_id = ? LIMIT 1',
      [viewerId],
    )

    await swipe({ challengeId: String(own[0]?.['id']), action: 'skip' }).expect(
      404,
    )
  })
})
