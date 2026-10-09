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

const config = loadConfig({
  DATABASE_URL: testDatabaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const author = 'sanne.kuipers@example.invalid'
const stranger = 'milan.horvat@example.invalid'
const body =
  'Since we flattened, nobody knows who can decide what about budgets.'

let db: TestDatabase
let app: ReturnType<typeof createApp>
let cookies: Record<string, string>
let challengeId: string

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
  cookies = {
    author: await cookieFor(deps, author),
    stranger: await cookieFor(deps, stranger),
  }
})

afterAll(async () => {
  await db.query('DELETE FROM challenges WHERE body = ?', [body])
  await db.close()
})

describe('the ask journey over Postgres (F5)', () => {
  it('saves a challenge and picks its trend (R-ASK-4,5)', async () => {
    const response = await request(app)
      .post('/api/challenges')
      .set('Cookie', cookies['author']!)
      .send({ body })

    const { challenge } = response.body as {
      challenge: { id: string; autoTrend: string }
    }
    challengeId = challenge.id
    expect(response.status).toBe(201)
    expect(challenge.autoTrend).toBe('06')
  })

  it('shows a trend with its curated cases, and no member (design S9)', async () => {
    const response = await request(app)
      .get('/api/trends/06')
      .set('Cookie', cookies['stranger']!)
      .expect(200)
    const detail = response.body as {
      trend: { short: string }
      cases: { org: string }[]
    }

    expect(detail.trend.short).toBe('Distributed Decision Making')
    expect(detail.cases.length).toBeGreaterThan(0)
    expect(JSON.stringify(detail)).not.toContain('@')
    await request(app)
      .get('/api/trends/99')
      .set('Cookie', cookies['stranger']!)
      .expect(404)
  })

  it('keeps it from anyone but its author (R-NAV-8)', async () => {
    await request(app)
      .get(`/api/challenges/${challengeId}`)
      .set('Cookie', cookies['stranger']!)
      .expect(404)
    await request(app)
      .get(`/api/challenges/${challengeId}/matches`)
      .set('Cookie', cookies['stranger']!)
      .expect(404)
  })

  it('records an override (R-ASK-6,7)', async () => {
    await request(app)
      .patch(`/api/challenges/${challengeId}`)
      .set('Cookie', cookies['author']!)
      .send({ trendId: '04' })
      .expect(204)

    const rows = await db.query(
      'SELECT trend_id, auto_trend, overridden FROM challenges WHERE id = ?',
      [challengeId],
    )
    expect(rows[0]).toEqual({
      trend_id: '04',
      auto_trend: '06',
      overridden: true,
    })
  })

  it('matches peers, offers and cases for the trend, never an email (R-ASK-8)', async () => {
    const response = await request(app)
      .get(`/api/challenges/${challengeId}/matches`)
      .set('Cookie', cookies['author']!)

    const matches = response.body as Matches
    expect(matches.trend).toMatchObject({ id: '04', from: 'Plan & Predict' })
    expect(matches.sameBoat.map((p) => p.name)).toContain('Diego Salas')
    expect(matches.beenThere.map((p) => p.name)).toContain('Lars Petersen')
    expect(matches.cases.length).toBeGreaterThan(0)
    expect(JSON.stringify(matches)).not.toContain('@')
  })

  it('puts the latest been-there offer first (ADR 0048)', async () => {
    const rows = await db.query('SELECT id FROM members WHERE email = ?', [
      stranger,
    ])
    const strangerId = String(rows[0]?.['id'])
    await db.query(
      "INSERT INTO member_expertise (member_id, trend_id, note, created_at) VALUES (?, '04', 'Moved budgets to the teams.', now() + interval '1 day')",
      [strangerId],
    )

    const response = await request(app)
      .get(`/api/challenges/${challengeId}/matches`)
      .set('Cookie', cookies['author']!)
    await db.query(
      "DELETE FROM member_expertise WHERE member_id = ? AND trend_id = '04'",
      [strangerId],
    )

    const offers = (response.body as Matches).beenThere
    expect(offers.length).toBeGreaterThan(1)
    expect(offers[0]?.memberId).toBe(strangerId)
    expect(offers[0]).not.toHaveProperty('since')
  })

  it('leads the newest challenges for others, without its author (R-ASK-14)', async () => {
    const response = await request(app)
      .get('/api/challenges/newest?trend=04')
      .set('Cookie', cookies['stranger']!)
      .expect(200)
    const { challenges } = response.body as {
      challenges: { body: string; trend: { id: string } }[]
    }

    expect(challenges[0]).toEqual({
      body,
      trend: { id: '04', short: expect.any(String) as string },
    })
    expect(challenges.length).toBe(config.limits.newestChallengesShown)
    expect(challenges.every((each) => each.trend.id === '04')).toBe(true)
    expect(JSON.stringify(challenges)).not.toContain('Sanne')
  })

  it('never shows a member their own challenge as the newest', async () => {
    const response = await request(app)
      .get('/api/challenges/newest')
      .set('Cookie', cookies['author']!)
      .expect(200)

    const { challenges } = response.body as { challenges: { body: string }[] }
    expect(challenges.length).toBe(config.limits.newestChallengesShown)
    expect(challenges.map((each) => each.body)).not.toContain(body)
  })

  it('never lists the author among their own matches', async () => {
    const response = await request(app)
      .get(`/api/challenges/${challengeId}/matches`)
      .set('Cookie', cookies['author']!)

    const names = (response.body as Matches).sameBoat.map((p) => p.name)
    expect(names).not.toContain('Sanne Kuipers')
  })
})
