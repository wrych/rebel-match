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
import type { Matches } from '../../src/services/challenges.js'
import type { ConnectionView } from '../../src/services/connections.js'
import type { DeckCard } from '../../src/services/deck.js'

const PER_DAY = 4
const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
  REPORTS_PER_DAY: String(PER_DAY),
})
const body = 'Book my strategy call and save half with the code REBEL50 now.'
const pending = randomUUID()
const accepted = randomUUID()

let db: TestDatabase
let app: ReturnType<typeof createApp>
let author: string
let reporter: string
let bystander: string
let authorId: string
let reporterId: string
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

function report(cookie: string, item: object): request.Test {
  return request(app)
    .post('/api/reports')
    .set('Cookie', cookie)
    .send({ ...item, reason: 'spam', comment: 'Selling.' })
}

async function deckOf(cookie: string): Promise<string[]> {
  const response = await request(app).get('/api/deck').set('Cookie', cookie)
  return (response.body as { cards: DeckCard[] }).cards.map(
    (card) => card.challengeId,
  )
}

// The challenges behind the same-boat cards on the reporter's own matches.
async function peersOf(cookie: string): Promise<(string | null)[]> {
  const [own] = await db.query(
    "SELECT id FROM challenges WHERE member_id = ? AND status = 'active' AND trend_id = '06' LIMIT 1",
    [reporterId],
  )
  const response = await request(app)
    .get(`/api/challenges/${String(own?.['id'])}/matches`)
    .set('Cookie', cookie)
    .expect(200)
  return (response.body as Matches).sameBoat.map((peer) => peer.challengeId)
}

async function newestOf(cookie: string): Promise<string> {
  const response = await request(app)
    .get('/api/challenges/newest?trend=06')
    .set('Cookie', cookie)
  return JSON.stringify(response.body)
}

beforeAll(async () => {
  db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  const deps = composeApp(config, db.drizzle)
  app = createApp(deps)
  authorId = await idOf('sanne.kuipers@example.invalid')
  reporterId = await idOf('milan.horvat@example.invalid')
  const cookie = async (id: string): Promise<string> => {
    const session = await deps.auth.createSession(id)
    return `${session.name}=${session.value}`
  }
  author = await cookie(authorId)
  reporter = await cookie(reporterId)
  bystander = await cookie(await idOf('priya.raman@example.invalid'))
  await db.query('DELETE FROM reports WHERE reporter_id = ?', [reporterId])

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
     VALUES (?, ?, ?, NULL, 'been_there', 'Use my code REBEL50.', 'pending'),
            (?, ?, ?, NULL, 'same_boat', 'Buy my course.', 'accepted')`,
    [pending, authorId, reporterId, accepted, authorId, reporterId],
  )
})

afterAll(async () => {
  await db.query('DELETE FROM reports WHERE reporter_id = ?', [reporterId])
  await db.query('DELETE FROM connection_requests WHERE id IN (?, ?)', [
    pending,
    accepted,
  ])
  await db.query('DELETE FROM notifications WHERE challenge_id = ?', [
    challengeId,
  ])
  await db.query('DELETE FROM challenges WHERE id = ?', [challengeId])
  await db.close()
})

describe('reporting over Postgres (F20, R-MOD-1..4)', () => {
  it('shows the reporter what they report, and the author nothing of their own (R-NAV-8)', async () => {
    const mine = await request(app)
      .get(`/api/reports/challenge/${challengeId}`)
      .set('Cookie', author)
    const theirs = await request(app)
      .get(`/api/reports/challenge/${challengeId}`)
      .set('Cookie', reporter)
      .expect(200)

    expect(mine.status).toBe(404)
    expect(theirs.body).toEqual({
      target: {
        kind: 'challenge',
        body,
        trendShort: expect.any(String) as string,
        alreadyReported: false,
      },
    })
  })

  it('records a challenge once, and takes it out of the reporter’s view only (R-MOD-4)', async () => {
    expect(await newestOf(reporter)).toContain(body)
    expect(await peersOf(reporter)).toContain(challengeId)

    await report(reporter, { challengeId }).expect(204)
    await report(reporter, { challengeId }).expect(409)

    const rows = await db.query(
      'SELECT reported_id, reason, comment FROM reports WHERE challenge_id = ?',
      [challengeId],
    )
    expect(rows).toEqual([
      { reported_id: authorId, reason: 'spam', comment: 'Selling.' },
    ])
    expect(await deckOf(reporter)).not.toContain(challengeId)
    expect(await newestOf(reporter)).not.toContain(body)
    expect(await peersOf(reporter)).not.toContain(challengeId)
    expect(await newestOf(bystander)).toContain(body)
  })

  it('lets only the member a note was sent to report it (R-MOD-2)', async () => {
    await report(author, { requestId: pending }).expect(404)
    await report(bystander, { requestId: pending }).expect(404)

    expect(await statusOf(pending)).toBe('pending')
  })

  it('declines a pending request whose note is reported, telling nobody', async () => {
    await report(reporter, { requestId: pending }).expect(204)

    expect(await statusOf(pending)).toBe('declined')
  })

  it('keeps an accepted connection, showing the reporter Reported in place of the note', async () => {
    await report(reporter, { requestId: accepted }).expect(204)

    const response = await request(app)
      .get('/api/connections/connected')
      .set('Cookie', reporter)
    const view = (
      response.body as { connections: ConnectionView[] }
    ).connections.find((each) => each.id === accepted)
    const theirs = await request(app)
      .get('/api/connections/connected')
      .set('Cookie', author)

    expect(await statusOf(accepted)).toBe('accepted')
    expect(view).toMatchObject({ message: null, noteReported: true })
    expect(JSON.stringify(theirs.body)).toContain('Buy my course.')
  })

  it('reports a withdrawn challenge still, without its text', async () => {
    await request(app)
      .post(`/api/challenges/${challengeId}/withdraw`)
      .set('Cookie', author)
      .expect(204)

    const response = await request(app)
      .get(`/api/reports/challenge/${challengeId}`)
      .set('Cookie', bystander)
      .expect(200)

    expect(response.body).toMatchObject({ target: { body: null } })
    await report(bystander, { challengeId }).expect(204)
  })

  it(`stops a member at ${String(PER_DAY)} reports a day`, async () => {
    const others = await db.query(
      `SELECT c.id FROM challenges c JOIN members m ON m.id = c.member_id
        WHERE c.status = 'active' AND c.member_id <> ? AND m.status = 'active'
        LIMIT 2`,
      [reporterId],
    )
    const [one, two] = others.map((row) => String(row['id']))

    await report(reporter, { challengeId: one }).expect(204)
    await report(reporter, { challengeId: two }).expect(429)
  })
})
