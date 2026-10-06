import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { cockpitRoutes } from './cockpit.js'

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
const cockpit = {
  challenges: [],
  following: [],
  pendingIncoming: 2,
  newConnections: 1,
}

function setup(): { app: Express; calls: string[] } {
  const calls: string[] = []
  const app = express()
  app.use(
    cockpitRoutes({
      auth,
      cockpit: {
        cockpit: (m) => {
          calls.push(`cockpit:${m}`)
          return Promise.resolve(cockpit)
        },
        seen: (m) => {
          calls.push(`seen:${m}`)
          return Promise.resolve()
        },
      },
      follows: {
        follow: (m, t) => {
          calls.push(`follow:${m}:${t}`)
          return Promise.resolve(t === '06' ? 'followed' : 'unknown_trend')
        },
        unfollow: (m, t) => {
          calls.push(`unfollow:${m}:${t}`)
          return Promise.resolve()
        },
        followed: () => Promise.resolve([]),
      },
    }),
  )
  return { app, calls }
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('cockpit routes', () => {
  it("returns the member's own cockpit (R-MINE-1,3,4)", async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .get('/api/cockpit')
      .set('Cookie', await cookie())

    expect(response.body).toEqual(cockpit)
    expect(calls).toEqual(['cockpit:m-ada'])
  })

  it.each([
    ['06', 204],
    ['99', 404],
  ])('follows trend %s with %i (R-ASK-9)', async (trendId, status) => {
    const response = await request(setup().app)
      .post(`/api/follows/${trendId}`)
      .set('Cookie', await cookie())

    expect(response.status).toBe(status)
  })

  it('unfollows', async () => {
    const { app, calls } = setup()

    await request(app)
      .delete('/api/follows/06')
      .set('Cookie', await cookie())
      .expect(204)
    expect(calls).toEqual(['unfollow:m-ada:06'])
  })

  it('records that the member opened Matches (R-MINE-4)', async () => {
    const { app, calls } = setup()

    await request(app)
      .post('/api/matches/seen')
      .set('Cookie', await cookie())
      .expect(204)
    expect(calls).toEqual(['seen:m-ada'])
  })

  it('asks for a session', async () => {
    expect((await request(setup().app).get('/api/cockpit')).status).toBe(401)
    expect((await request(setup().app).post('/api/matches/seen')).status).toBe(
      401,
    )
  })
})
