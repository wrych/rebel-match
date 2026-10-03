import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { SwipeInput } from '../services/swipes.js'
import { swipeRoutes } from './swipes.js'

const config = loadConfig({
  DATABASE_URL: 'mysql://user:pw@localhost:3306/rebel_match',
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

function setup(): { app: Express; swiped: SwipeInput[] } {
  const swiped: SwipeInput[] = []
  const app = express()
  app.use(express.json())
  app.use(
    swipeRoutes({
      auth,
      config,
      swipes: {
        swipe: (_m, input) => {
          swiped.push(input)
          return Promise.resolve(
            input.challengeId === 'c-gone'
              ? { result: 'not_found' }
              : { result: 'recorded' },
          )
        },
      },
    }),
  )
  return { app, swiped }
}

async function post(app: Express, body: object): Promise<request.Response> {
  const session = await auth.createSession('m-ada')
  return request(app)
    .post('/api/swipe')
    .set('Cookie', `${session.name}=${session.value}`)
    .send(body)
}

describe('POST /api/swipe', () => {
  it.each(['same_boat', 'follow', 'skip'])(
    'records %s (R-OFF-3)',
    async (action) => {
      const { app, swiped } = setup()

      const response = await post(app, { challengeId: 'c-1', action })

      expect(response.status).toBe(201)
      expect(swiped).toEqual([{ challengeId: 'c-1', action }])
    },
  )

  it('takes a been-there note of more than 30 characters, trimmed (R-OFF-4)', async () => {
    const { app, swiped } = setup()

    await post(app, {
      challengeId: 'c-1',
      action: 'been_there',
      note: `  ${'n'.repeat(31)}  `,
    })

    expect(swiped).toEqual([
      { challengeId: 'c-1', action: 'been_there', note: 'n'.repeat(31) },
    ])
  })

  it.each([
    { challengeId: 'c-1', action: 'been_there' },
    { challengeId: 'c-1', action: 'been_there', note: 'n'.repeat(30) },
    { challengeId: 'c-1', action: 'been_there', note: `  ${'n'.repeat(29)}  ` },
    { challengeId: 'c-1', action: 'been_there', note: 'n'.repeat(601) },
    { challengeId: 'c-1', action: 'shrug' },
    { action: 'skip' },
  ])('refuses %j (R-OFF-4, R-CFG-3)', async (body) => {
    const { app, swiped } = setup()

    expect((await post(app, body)).status).toBe(400)
    expect(swiped).toEqual([])
  })

  it('answers 404 for a card that is not swipeable', async () => {
    expect(
      (await post(setup().app, { challengeId: 'c-gone', action: 'skip' }))
        .status,
    ).toBe(404)
  })
})
