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
import { DEV_ADMIN_EMAIL } from '../../src/seed/dev/people.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import type { ModeratedChallenge } from '../../src/services/challenge-moderation.js'
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
  'Join my paid leadership bootcamp, half price for rebels this week.'
const pending = randomUUID()
const accepted = randomUUID()

let db: TestDatabase
let app: ReturnType<typeof createApp>
let author: string
let peer: string
let host: string
let authorId: string
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

async function newestFor(cookie: string): Promise<string> {
  const response = await request(app)
    .get('/api/challenges/newest?trend=06')
    .set('Cookie', cookie)
  return JSON.stringify(response.body)
}

async function listed(): Promise<ModeratedChallenge | undefined> {
  const response = await request(app)
    .get(`/api/admin/members/${authorId}/challenges`)
    .set('Cookie', host)
    .expect(200)
  return (
    response.body as { challenges: ModeratedChallenge[] }
  ).challenges.find((each) => each.id === challengeId)
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  await db.query("UPDATE members SET status = 'active' WHERE email = ?", [
    DEV_ADMIN_EMAIL,
  ])
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  authorId = await idOf(authorEmail)
  const peerId = await idOf(peerEmail)
  const cookie = async (id: string): Promise<string> => {
    const session = await deps.auth.createSession(id)
    return `${session.name}=${session.value}`
  }
  author = await cookie(authorId)
  peer = await cookie(peerId)
  host = await cookie(await idOf(DEV_ADMIN_EMAIL))

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

describe('a host hiding a challenge over Postgres (R-MOD-8)', () => {
  it('lets nobody without challenge:moderate hide it', async () => {
    await request(app)
      .post(`/api/admin/challenges/${challengeId}/hide`)
      .set('Cookie', peer)
      .send({ reason: 'spam' })
      .expect(404)

    expect((await listed())?.state).toBe('shown')
  })

  it('hides it once, closing the pending request and keeping the accepted one', async () => {
    await request(app)
      .post(`/api/admin/challenges/${challengeId}/hide`)
      .set('Cookie', host)
      .send({ reason: 'spam' })
      .expect(204)
    await request(app)
      .post(`/api/admin/challenges/${challengeId}/hide`)
      .set('Cookie', host)
      .send({ reason: 'spam' })
      .expect(404)

    expect(await statusOf(pending)).toBe('declined')
    expect(await statusOf(accepted)).toBe('accepted')
    expect(await listed()).toMatchObject({
      body,
      state: 'hidden',
      hiddenReason: 'spam',
    })
  })

  it('shows it to nobody else: not in the deck, the newest or a connection', async () => {
    const deck = await request(app).get('/api/deck').set('Cookie', peer)
    const cards = (deck.body as { cards: DeckCard[] }).cards
    const connected = await request(app)
      .get('/api/connections/connected')
      .set('Cookie', peer)
    const { connections } = connected.body as {
      connections: ConnectionView[]
    }

    expect(cards.map((card) => card.challengeId)).not.toContain(challengeId)
    expect(await newestFor(peer)).not.toContain(body)
    expect(connections.find((each) => each.id === accepted)?.challenge).toEqual(
      {
        id: challengeId,
        body: null,
        trendShort: expect.any(String) as string,
        withdrawn: false,
        hidden: true,
      },
    )
  })

  it('shows its author it was hidden, and why, uncounted', async () => {
    const response = await request(app)
      .get('/api/cockpit')
      .set('Cookie', author)
    const mine = (response.body as Cockpit).challenges.find(
      (each) => each.id === challengeId,
    )

    expect(mine).toMatchObject({
      body,
      withdrawn: false,
      hiddenReason: 'spam',
      counts: null,
    })
  })

  it('shows it again on unhide, reopening no request', async () => {
    await request(app)
      .post(`/api/admin/challenges/${challengeId}/unhide`)
      .set('Cookie', host)
      .expect(204)
    await request(app)
      .post(`/api/admin/challenges/${challengeId}/unhide`)
      .set('Cookie', host)
      .expect(404)

    expect(await newestFor(peer)).toContain(body)
    expect(await statusOf(pending)).toBe('declined')
    expect(await listed()).toMatchObject({ state: 'shown', hiddenReason: null })
  })

  it('lists a withdrawn challenge to the host without its text (R-ASK-17)', async () => {
    await request(app)
      .post(`/api/challenges/${challengeId}/withdraw`)
      .set('Cookie', author)
      .expect(204)

    expect(await listed()).toMatchObject({ state: 'withdrawn', body: null })
  })
})
