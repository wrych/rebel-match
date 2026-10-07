import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { AnalyticsEvent } from '../services/analytics.js'
import { eventRoutes } from './events.js'

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

function setup(): { app: Express; tracked: [string, AnalyticsEvent][] } {
  const tracked: [string, AnalyticsEvent][] = []
  const app = express()
  app.use(express.json())
  app.use(
    eventRoutes({
      auth,
      track: (memberId, event) => {
        tracked.push([memberId, event])
        return Promise.resolve()
      },
    }),
  )
  return { app, tracked }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('POST /api/events', () => {
  it.each([
    [
      { event: 'journey_chosen', props: { journey: 'offer' } },
      { name: 'journey_chosen', journey: 'offer' },
    ],
    [
      { event: 'feedback_opened', props: { screen: 'cockpit' } },
      { name: 'feedback_opened', screen: 'cockpit' },
    ],
    [{ event: 'game_opened', props: {} }, { name: 'game_opened' }],
  ])('relays %j for the signed-in member (ADR 0026)', async (body, event) => {
    const { app, tracked } = setup()

    const response = await request(app)
      .post('/api/events')
      .set('Cookie', await cookie())
      .send(body)

    expect(response.status).toBe(204)
    expect(tracked).toEqual([['m-ada', event]])
  })

  it.each([
    ['an event outside the list', { event: 'page_view', props: {} }],
    [
      'a property outside the list',
      {
        event: 'journey_chosen',
        props: { journey: 'ask', email: 'a@example.invalid' },
      },
    ],
    [
      'a screen that is a path, not a route name',
      { event: 'feedback_opened', props: { screen: '/challenges/c-1' } },
    ],
    [
      'a game opened with a pseudonym',
      { event: 'game_opened', props: { pseudonym: 'Furious Rebel' } },
    ],
    [
      'a journey outside the two',
      { event: 'journey_chosen', props: { journey: 'x' } },
    ],
  ])(
    'refuses %s with 400 and relays nothing (R-ANA-3)',
    async (_case, body) => {
      const { app, tracked } = setup()

      const response = await request(app)
        .post('/api/events')
        .set('Cookie', await cookie())
        .send(body)

      expect(response.status).toBe(400)
      expect(tracked).toEqual([])
    },
  )

  it('asks for a session', async () => {
    const response = await request(setup().app)
      .post('/api/events')
      .send({ event: 'journey_chosen', props: { journey: 'ask' } })

    expect(response.status).toBe(401)
  })
})
