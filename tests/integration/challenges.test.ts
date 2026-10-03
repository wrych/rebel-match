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

  it('never lists the author among their own matches', async () => {
    const response = await request(app)
      .get(`/api/challenges/${challengeId}/matches`)
      .set('Cookie', cookies['author']!)

    const names = (response.body as Matches).sameBoat.map((p) => p.name)
    expect(names).not.toContain('Sanne Kuipers')
  })
})
