import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { createNetwork } from '../services/network.js'
import { networkRoutes } from './network.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-ada', email: 'a@example.invalid', roles: ['member'] },
    { id: 'm-none', email: 'n@example.invalid', roles: [] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})

function setup(networkReplay = 1, neededOwnLinks = 0): Express {
  const network = createNetwork({
    neededOwnLinks: () => neededOwnLinks,
    store: {
      facts: () =>
        Promise.resolve({
          members: [
            { id: 'm-ada', joinedAt: new Date('2026-10-02T09:00:00Z') },
            { id: 'm-ben', joinedAt: new Date('2026-10-01T09:00:00Z') },
          ],
          connections: [
            {
              a: 'm-ben',
              b: 'm-ada',
              formedAt: new Date('2026-10-04T09:00:00Z'),
            },
          ],
          challenges: [
            { memberId: 'm-ada', postedAt: new Date('2026-10-03T09:00:00Z') },
          ],
        }),
    },
  })
  const app = express()
  const settings = {
    limits: () => ({ ...config.limits, networkReplay }),
  }
  app.use(networkRoutes({ auth, settings, network }))
  return app
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('network routes', () => {
  it('replays the network with the caller marked (R-NET-1, R-NET-2)', async () => {
    const response = await request(setup())
      .get('/api/network')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      nodes: [
        { id: 0, at: 0, day: '2026-10-01', self: false },
        {
          id: 1,
          at: expect.any(Number) as number,
          day: '2026-10-02',
          self: true,
        },
      ],
      links: [{ source: 0, target: 1, at: 1, day: '2026-10-04' }],
      moons: [{ node: 1, at: expect.any(Number) as number, day: '2026-10-03' }],
      own: { count: 1, needed: 0, shown: true },
    })
  })

  it('is not found without network:view (R-NET-5, R-ROLE-3)', async () => {
    const response = await request(setup())
      .get('/api/network')
      .set('Cookie', await cookieFor('m-none'))

    expect(response.status).toBe(404)
  })

  it('leaves out the caller’s lines while they have too few (R-NET-13)', async () => {
    const response = await request(setup(1, 5))
      .get('/api/network')
      .set('Cookie', await cookieFor('m-ada'))
    const body = response.body as { links: unknown[]; own: unknown }

    expect(body.links).toEqual([])
    expect(body.own).toEqual({ count: 1, needed: 5, shown: false })
  })

  it('is not found while hosts have it off (R-NET-6)', async () => {
    const response = await request(setup(0))
      .get('/api/network')
      .set('Cookie', await cookieFor('m-ada'))

    expect(response.status).toBe(404)
  })

  it('asks nobody signed in to sign in', async () => {
    const response = await request(setup()).get('/api/network')

    expect(response.status).toBe(401)
  })
})
