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
    [{ event: 'recap_opened', props: {} }, { name: 'recap_opened' }],
    [
      { event: 'recap_shared', props: { via: 'linkedin' } },
      { name: 'recap_shared', via: 'linkedin' },
    ],
    [
      {
        event: 'experiment_exposed',
        props: { experiment: 'matches_layout', variant: 'summary' },
      },
      {
        name: 'experiment_exposed',
        experiment: 'matches_layout',
        variant: 'summary',
      },
    ],
    [
      { event: 'matches_section_opened', props: { section: 'been_there' } },
      { name: 'matches_section_opened', section: 'been_there' },
    ],
    [
      { event: 'match_connect_tapped', props: { kind: 'same_boat' } },
      { name: 'match_connect_tapped', kind: 'same_boat' },
    ],
    [
      { event: 'notifications_list_opened', props: { new_count: 2 } },
      { name: 'notifications_list_opened', new_count: 2 },
    ],
    [
      { event: 'contact_reached_out', props: { method: 'copy' } },
      { name: 'contact_reached_out', method: 'copy' },
    ],
    [
      {
        event: 'notification_opened',
        props: { type: 'connection_accepted', via: 'email' },
      },
      {
        name: 'notification_opened',
        type: 'connection_accepted',
        via: 'email',
      },
    ],
    [
      { event: 'screen_viewed', props: { screen: 'trend' } },
      { name: 'screen_viewed', screen: 'trend' },
    ],
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
      'a screen viewed by its path, which names a challenge',
      { event: 'screen_viewed', props: { screen: '/challenges/c-1' } },
    ],
    [
      'a recap shared with a figure (R-RECAP-7)',
      { event: 'recap_shared', props: { via: 'image', count: 4 } },
    ],
    [
      'a game opened with a pseudonym',
      { event: 'game_opened', props: { pseudonym: 'Furious Rebel' } },
    ],
    [
      'an experiment not in code (R-EXP-2)',
      {
        event: 'experiment_exposed',
        props: { experiment: 'pricing', variant: 'cards' },
      },
    ],
    [
      'a variant of another experiment (R-EXP-2)',
      {
        event: 'experiment_exposed',
        props: { experiment: 'matches_layout', variant: 'blue' },
      },
    ],
    [
      'an exposure with who saw it',
      {
        event: 'experiment_exposed',
        props: {
          experiment: 'matches_layout',
          variant: 'cards',
          memberId: 'm-ada',
        },
      },
    ],
    [
      'a connect tap with the peer it was for (R-ASK-16)',
      {
        event: 'match_connect_tapped',
        props: { kind: 'same_boat', memberId: 'm-bob' },
      },
    ],
    [
      'a section outside the three',
      { event: 'matches_section_opened', props: { section: 'members' } },
    ],
    [
      'a reach-out with the address it went to (R-ANA-3)',
      {
        event: 'contact_reached_out',
        props: { method: 'email', email: 'b@example.invalid' },
      },
    ],
    [
      'a count that is not a whole number',
      { event: 'notifications_list_opened', props: { new_count: -1 } },
    ],
    [
      'a notification of a kind there is not',
      {
        event: 'notification_opened',
        props: { type: 'newsletter', via: 'app' },
      },
    ],
    [
      'a notification opened with the request it was about',
      {
        event: 'notification_opened',
        props: { type: 'connection_request', via: 'app', id: 'r-1' },
      },
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
