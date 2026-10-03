import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RowDataPacket } from 'mysql2/promise'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { composeApp } from '../../src/compose.js'
import { loadConfig } from '../../src/config.js'
import { createPool, type Pool } from '../../src/db.js'
import { migrate } from '../../src/migrations/run.js'
import { planSeed } from '../../src/seed/plan.js'
import { applySeed } from '../../src/seed/run.js'
import type { Matches } from '../../src/services/challenges.js'

const databaseUrl = process.env['DATABASE_URL']

if (databaseUrl === undefined) {
  throw new Error('integration tests need DATABASE_URL')
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: 'integration-session-secret-of-32-chars',
  NODE_ENV: 'test',
  SEED_PROFILE: 'dev',
})
const author = 'sanne.kuipers@example.invalid'
const stranger = 'milan.horvat@example.invalid'
const body =
  'Since we flattened, nobody knows who can decide what about budgets.'

let pool: Pool
let app: ReturnType<typeof createApp>
let cookies: Record<string, string>
let challengeId: string

async function cookieFor(
  deps: ReturnType<typeof composeApp>,
  email: string,
): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM members WHERE email = ?',
    [email],
  )
  const session = await deps.auth.createSession(String(rows[0]?.['id']))
  return `${session.name}=${session.value}`
}

beforeAll(async () => {
  await migrate(databaseUrl, 'migrations')
  pool = createPool(config)
  await applySeed(pool, planSeed(config), config.consentVersion)
  const deps = composeApp(config, pool)
  app = createApp(deps)
  cookies = {
    author: await cookieFor(deps, author),
    stranger: await cookieFor(deps, stranger),
  }
})

afterAll(async () => {
  await pool.query('DELETE FROM challenges WHERE body = ?', [body])
  await pool.end()
})

describe('the ask journey over MySQL (F5)', () => {
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

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT trend_id, auto_trend, overridden FROM challenges WHERE id = ?',
      [challengeId],
    )
    expect(rows[0]).toEqual({ trend_id: '04', auto_trend: '06', overridden: 1 })
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
