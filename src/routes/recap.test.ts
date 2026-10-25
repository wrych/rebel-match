import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { RecapService } from '../services/recap.js'
import { recapRoutes } from './recap.js'

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

function setup(
  recapOn: number,
  opensAt = 0,
  now = Date.UTC(2026, 10, 8, 18, 0),
): { app: Express; asked: string[] } {
  const asked: string[] = []
  const recap: RecapService = {
    mine: (memberId) => {
      asked.push(memberId)
      return Promise.resolve({
        joined: '2026-10-02',
        members: 1,
        rows: [],
        timeline: { nodes: [], links: [], moons: [], own: null },
      })
    },
  }
  const app = express()
  const settings = {
    limits: () => ({ ...config.limits, recap: recapOn, recapOpensAt: opensAt }),
  }
  app.use(recapRoutes({ auth, settings, recap, now: () => now }))
  return { app, asked }
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('recap routes', () => {
  it('answers with the caller’s own recap (R-RECAP-4)', async () => {
    const { app, asked } = setup(1)

    const response = await request(app)
      .get('/api/recap')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ joined: '2026-10-02', members: 1 })
    expect(asked).toEqual(['m-ada'])
  })

  it('is not found while hosts have it off (R-RECAP-1)', async () => {
    const { app, asked } = setup(0)

    const response = await request(app)
      .get('/api/recap')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(404)
    expect(asked).toEqual([])
  })

  it('opens by itself at the time hosts set (R-RECAP-8)', async () => {
    const opensAt = Date.UTC(2026, 10, 8, 17, 0) / 60_000
    const cookie = await cookieFor('m-ada')
    const before = setup(0, opensAt, Date.UTC(2026, 10, 8, 16, 59)).app
    const after = setup(0, opensAt, Date.UTC(2026, 10, 8, 17, 0)).app

    expect(
      (await request(before).get('/api/recap').set('Cookie', cookie)).status,
    ).toBe(404)
    expect(
      (await request(after).get('/api/recap').set('Cookie', cookie)).status,
    ).toBe(200)
  })

  it('asks for a session', async () => {
    const response = await request(setup(1).app).get('/api/recap')

    expect(response.status).toBe(401)
  })
})
