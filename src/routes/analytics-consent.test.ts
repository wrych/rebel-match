import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { AnalyticsChoice } from '../services/analytics-consent.js'
import { analyticsConsentRoutes } from './analytics-consent.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-ada', email: 'a@example.invalid', roles: ['member'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})

function setup(outcome: 'done' | 'stale' = 'done'): {
  app: Express
  chosen: { memberId: string; choice: AnalyticsChoice }[]
} {
  const chosen: { memberId: string; choice: AnalyticsChoice }[] = []
  const app = express()
  app.use(express.json())
  app.use(
    analyticsConsentRoutes({
      auth,
      analyticsConsent: {
        choose: (memberId, choice) => {
          chosen.push({ memberId, choice })
          return Promise.resolve(outcome)
        },
      },
    }),
  )
  return { app, chosen }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('PUT /api/me/analytics', () => {
  it.each([
    [{ optIn: true, version: '2026-10-04' }],
    [{ optIn: false }],
    [{ optIn: false, from: 'onboarding' }],
  ] as const)('records %j for the signed-in member (R-ANA-4)', async (body) => {
    const { app, chosen } = setup()

    const response = await request(app)
      .put('/api/me/analytics')
      .set('Cookie', await cookie())
      .send(body)

    expect(response.status).toBe(204)
    expect(chosen).toEqual([{ memberId: 'm-ada', choice: body }])
  })

  it('passes on that the opt-in comes from the usage step (R-ANA-6)', async () => {
    const { app, chosen } = setup()
    const body = { optIn: true, version: '2026-10-07', from: 'onboarding' }

    const response = await request(app)
      .put('/api/me/analytics')
      .set('Cookie', await cookie())
      .send(body)

    expect(response.status).toBe(204)
    expect(chosen).toEqual([{ memberId: 'm-ada', choice: body }])
  })

  it('answers 409 when the words changed', async () => {
    const response = await request(setup('stale').app)
      .put('/api/me/analytics')
      .set('Cookie', await cookie())
      .send({ optIn: true, version: '2025-01-01' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ result: 'stale_analytics' })
  })

  it.each([
    [{}],
    [{ optIn: true }],
    [{ optIn: 'yes' }],
    [{ optIn: true, version: '2026-10-07', from: 'profile' }],
  ])('refuses %j with 400', async (body) => {
    const { app, chosen } = setup()

    const response = await request(app)
      .put('/api/me/analytics')
      .set('Cookie', await cookie())
      .send(body)

    expect(response.status).toBe(400)
    expect(chosen).toEqual([])
  })

  it('asks for a session', async () => {
    const response = await request(setup().app)
      .put('/api/me/analytics')
      .send({ optIn: false })

    expect(response.status).toBe(401)
  })
})
