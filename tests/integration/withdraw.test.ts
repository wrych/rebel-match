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
import type { Cockpit } from '../../src/services/cockpit.js'
import type { ConnectionView } from '../../src/services/connections.js'
import type { DeckCard } from '../../src/services/deck.js'

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const authorEmail = 'sanne.kuipers@example.invalid'
const peerEmail = 'milan.horvat@example.invalid'
const body =
  'Our budget owners veto every team that tries to set its own spend.'
const pending = randomUUID()
const accepted = randomUUID()

let db: TestDatabase
let app: ReturnType<typeof createApp>
let author: string
let peer: string
let authorId: string
let peerId: string
let challengeId: string

async function idOf(email: string): Promise<string> {
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [email])
  return String(rows[0]?.['id'])
}

async function statusOf(id: string): Promise<unknown> {
  const rows = await db.query(
    'SELECT status FROM connection_requests WHERE id = ?',
    [id],
  )
  return rows[0]?.['status']
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  authorId = await idOf(authorEmail)
  peerId = await idOf(peerEmail)
  const cookie = async (id: string): Promise<string> => {
    const session = await deps.auth.createSession(id)
    return `${session.name}=${session.value}`
  }
  author = await cookie(authorId)
  peer = await cookie(peerId)

  const created = await request(app)
    .post('/api/challenges')
    .set('Cookie', author)
    .send({ body })
    .expect(201)
  challengeId = (created.body as { challenge: { id: string } }).challenge.id
  await request(app)
    .patch(`/api/challenges/${challengeId}`)
    .set('Cookie', author)
    .send({ trendId: '06' })
    .expect(204)
  await db.query(
    `INSERT INTO connection_requests
       (id, requester_id, target_id, challenge_id, kind, message, status)
     VALUES (?, ?, ?, ?, 'same_boat', 'Same here.', 'pending'),
            (?, ?, ?, ?, 'been_there', 'We solved it.', 'accepted')`,
    [
      pending,
      peerId,
      authorId,
      challengeId,
      accepted,
      peerId,
      authorId,
      challengeId,
    ],
  )
})

afterAll(async () => {
  await db.query('DELETE FROM connection_requests WHERE challenge_id = ?', [
    challengeId,
  ])
  await db.query('DELETE FROM notifications WHERE challenge_id = ?', [
    challengeId,
  ])
  await db.query('DELETE FROM challenges WHERE id = ?', [challengeId])
  await db.close()
})

describe('withdrawing a challenge over Postgres (R-ASK-17)', () => {
  it('is not found for anyone but its author', async () => {
    await request(app)
      .post(`/api/challenges/${challengeId}/withdraw`)
      .set('Cookie', peer)
      .expect(404)

    expect(await statusOf(pending)).toBe('pending')
  })

  it('withdraws it once, closing the pending request and keeping the accepted one', async () => {
    await request(app)
      .post(`/api/challenges/${challengeId}/withdraw`)
      .set('Cookie', author)
      .expect(204)
    await request(app)
      .post(`/api/challenges/${challengeId}/withdraw`)
      .set('Cookie', author)
      .expect(404)

    expect(await statusOf(pending)).toBe('declined')
    expect(await statusOf(accepted)).toBe('accepted')
  })

  it('shows it to nobody else: not in the deck, the newest or among peers', async () => {
    const deck = await request(app).get('/api/deck').set('Cookie', peer)
    const newest = await request(app)
      .get('/api/challenges/newest?trend=06')
      .set('Cookie', peer)
    const peerChallenge = await db.query(
      "SELECT id FROM challenges WHERE member_id = ? AND status = 'active' LIMIT 1",
      [peerId],
    )
    const matches = await request(app)
      .get(`/api/challenges/${String(peerChallenge[0]?.['id'])}/matches`)
      .set('Cookie', peer)

    const cards = (deck.body as { cards: DeckCard[] }).cards
    expect(cards.map((card) => card.challengeId)).not.toContain(challengeId)
    expect(JSON.stringify(newest.body)).not.toContain(body)
    expect(JSON.stringify(matches.body)).not.toContain(body)
  })

  it('keeps it in the author’s cockpit, marked withdrawn and uncounted', async () => {
    const response = await request(app)
      .get('/api/cockpit')
      .set('Cookie', author)
    const mine = (response.body as Cockpit).challenges.find(
      (each) => each.id === challengeId,
    )

    expect(mine).toMatchObject({ body, withdrawn: true, counts: null })
  })

  it('leaves its text out of what the two are connected over', async () => {
    const response = await request(app)
      .get('/api/connections/connected')
      .set('Cookie', peer)
    const { connections } = response.body as { connections: ConnectionView[] }
    const over = connections.find((each) => each.id === accepted)

    expect(over?.challenge).toEqual({
      id: challengeId,
      body: null,
      trendShort: expect.any(String) as string,
      withdrawn: true,
    })
  })
})
