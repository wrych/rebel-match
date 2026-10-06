import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { fixedSettings, loadConfig, type LiveSettings } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { Challenge, ChallengeService } from '../services/challenges.js'
import { challengeRoutes } from './challenges.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-ada', email: 'a@example.invalid', roles: ['member'] },
    { id: 'm-new', email: 'n@example.invalid', roles: [] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})
const challenge: Challenge = {
  id: 'c-1',
  memberId: 'm-ada',
  body: 'x'.repeat(40),
  trendId: null,
  autoTrend: '06',
  overridden: false,
  createdAt: '2026-11-08T10:00:00.000Z',
}

function setup(settings: LiveSettings = fixedSettings(config)): {
  app: Express
  calls: unknown[][]
} {
  const calls: unknown[][] = []
  const challenges: ChallengeService = {
    trends: () =>
      Promise.resolve([{ id: '06', short: 'DDM', from: 'Central', peers: 29 }]),
    create: (memberId, body) => {
      calls.push(['create', memberId, body])
      return Promise.resolve(challenge)
    },
    get: (memberId, id) =>
      Promise.resolve(memberId === 'm-ada' && id === 'c-1' ? challenge : null),
    confirmTrend: (memberId, id, trendId) => {
      calls.push(['confirm', memberId, id, trendId])
      return Promise.resolve(trendId === '99' ? 'unknown_trend' : 'saved')
    },
    matches: (memberId) =>
      Promise.resolve(
        memberId === 'm-ada'
          ? {
              trend: { id: '06', short: 'DDM', from: 'Central', peers: 29 },
              sameBoat: [],
              beenThere: [],
              cases: [],
            }
          : null,
      ),
    trend: (trendId) =>
      Promise.resolve(
        trendId === '06'
          ? {
              trend: { id: '06', short: 'DDM', from: 'Central', peers: 29 },
              cases: [
                { org: 'Haier', url: 'https://x.invalid', takeaway: 'T.' },
              ],
            }
          : null,
      ),
    newest: (memberId, trendId) => {
      calls.push(['newest', memberId, trendId])
      return Promise.resolve([
        {
          body: 'Nobody knows who decides.',
          trend: { id: '06', short: 'DDM' },
        },
      ])
    },
  }
  const app = express()
  app.use(express.json())
  app.use(challengeRoutes({ auth, challenges, settings }))
  return { app, calls }
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('challenge routes', () => {
  it('shows a trend with its case studies (design S9)', async () => {
    const response = await request(setup().app).get('/api/trends/06')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      trend: { id: '06', short: 'DDM', from: 'Central', peers: 29 },
      cases: [{ org: 'Haier', url: 'https://x.invalid', takeaway: 'T.' }],
    })
  })

  it('answers 404 for a trend that does not exist', async () => {
    const response = await request(setup().app).get('/api/trends/99')

    expect(response.status).toBe(404)
  })

  it('shows the newest challenges, in a trend when asked (R-ASK-14)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-ada')

    const all = await request(app)
      .get('/api/challenges/newest')
      .set('Cookie', cookie)
    await request(app)
      .get('/api/challenges/newest?trend=06')
      .set('Cookie', cookie)

    expect(all.status).toBe(200)
    expect(all.body).toEqual({
      challenges: [
        {
          body: 'Nobody knows who decides.',
          trend: { id: '06', short: 'DDM' },
        },
      ],
    })
    expect(calls).toEqual([
      ['newest', 'm-ada', null],
      ['newest', 'm-ada', '06'],
    ])
  })

  it('refuses a trend given more than once', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .get('/api/challenges/newest?trend=06&trend=08')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('hides the newest challenges from a member without challenge:swipe', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .get('/api/challenges/newest')
      .set('Cookie', await cookieFor('m-new'))

    expect(response.status).toBe(404)
    expect(calls).toEqual([])
  })

  it('lists the trends to pick from (R-ASK-6)', async () => {
    const response = await request(setup().app).get('/api/trends')

    expect(response.body).toEqual({
      trends: [{ id: '06', short: 'DDM', from: 'Central', peers: 29 }],
    })
  })

  it('creates a challenge for the signed-in member, trimmed (R-ASK-4)', async () => {
    const { app, calls } = setup()
    const body = `  ${'y'.repeat(31)}  `

    const response = await request(app)
      .post('/api/challenges')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ body })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ challenge })
    expect(calls).toEqual([['create', 'm-ada', 'y'.repeat(31)]])
  })

  it('applies a changed minimum length to the next challenge (ADR 0031)', async () => {
    const limits = { ...config.limits }
    const { app } = setup({ limits: () => limits, abuse: () => config.abuse })
    const cookie = await cookieFor('m-ada')
    limits.challengeMinChars = 40

    const response = await request(app)
      .post('/api/challenges')
      .set('Cookie', cookie)
      .send({ body: 'y'.repeat(31) })

    expect(response.status).toBe(400)
  })

  it('accepts a challenge of the longest length, trimmed (R-ASK-3)', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/challenges')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ body: `  ${'y'.repeat(config.limits.challengeMaxChars)}  ` })

    expect(response.status).toBe(201)
  })

  it('refuses a challenge longer than the longest (R-ASK-3)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/challenges')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ body: 'y'.repeat(config.limits.challengeMaxChars + 1) })

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it.each([{}, { body: 'too short' }, { body: `  ${'z'.repeat(30)}  ` }])(
    'refuses %j: thirty characters or fewer (R-ASK-3)',
    async (body) => {
      const { app, calls } = setup()

      const response = await request(app)
        .post('/api/challenges')
        .set('Cookie', await cookieFor('m-ada'))
        .send(body)

      expect(response.status).toBe(400)
      expect(calls).toEqual([])
    },
  )

  it('hides writing from a member without challenge:create (R-ROLE-3)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/challenges')
      .set('Cookie', await cookieFor('m-new'))
      .send({ body: 'y'.repeat(40) })

    expect(response.status).toBe(404)
    expect(calls).toEqual([])
  })

  it('shows a challenge to its author, and 404 to anyone else (R-NAV-8)', async () => {
    const { app } = setup()

    const mine = await request(app)
      .get('/api/challenges/c-1')
      .set('Cookie', await cookieFor('m-ada'))
    const other = await request(app)
      .get('/api/challenges/c-9')
      .set('Cookie', await cookieFor('m-ada'))

    expect(mine.body).toEqual({ challenge })
    expect(other.status).toBe(404)
  })

  it.each([
    ['06', 204],
    ['99', 400],
  ])('confirms trend %s with %i (R-ASK-7)', async (trendId, status) => {
    const response = await request(setup().app)
      .patch('/api/challenges/c-1')
      .set('Cookie', await cookieFor('m-ada'))
      .send({ trendId })

    expect(response.status).toBe(status)
  })

  it('returns matches to the author (R-ASK-8)', async () => {
    const response = await request(setup().app)
      .get('/api/challenges/c-1/matches')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.body).toMatchObject({ trend: { id: '06' }, sameBoat: [] })
  })
})
