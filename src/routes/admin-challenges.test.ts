import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type {
  ChallengeModeration,
  ModeratedChallenge,
} from '../services/challenge-moderation.js'
import { adminChallengeRoutes } from './admin-challenges.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-admin', email: 'a@example.invalid', roles: ['member', 'admin'] },
    { id: 'm-member', email: 'm@example.invalid', roles: ['member'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})
const shown: ModeratedChallenge = {
  id: 'c-1',
  body: 'Buy my course.',
  trendShort: 'DDM',
  state: 'shown',
  hiddenReason: null,
  createdAt: '2026-11-08T10:00:00.000Z',
}

function setup(): { app: Express; calls: string[][] } {
  const calls: string[][] = []
  const moderation: ChallengeModeration = {
    ofMember: (memberId) =>
      Promise.resolve(memberId === 'm-rik' ? [shown] : null),
    hide: (id, hiddenBy, reason) => {
      calls.push(['hide', id, hiddenBy, reason])
      return Promise.resolve(id === 'c-1' ? 'hidden' : 'not_found')
    },
    unhide: (id) => {
      calls.push(['unhide', id])
      return Promise.resolve(id === 'c-1' ? 'shown' : 'not_found')
    },
  }
  const app = express()
  app.use(express.json())
  app.use(adminChallengeRoutes({ auth, challengeModeration: moderation }))
  return { app, calls }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('admin challenge routes (R-MOD-8)', () => {
  it('lists a member’s challenges for a host, and 404 for no such member (R-MEM-2)', async () => {
    const { app } = setup()
    const cookie = await cookieFor('m-admin')

    const found = await request(app)
      .get('/api/admin/members/m-rik/challenges')
      .set('Cookie', cookie)
    const missing = await request(app)
      .get('/api/admin/members/m-nobody/challenges')
      .set('Cookie', cookie)

    expect(found.body).toEqual({ challenges: [shown] })
    expect(missing.status).toBe(404)
  })

  it('hides a challenge with the reason, recording the host', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/challenges/c-1/hide')
      .set('Cookie', await cookieFor('m-admin'))
      .send({ reason: 'spam' })

    expect(response.status).toBe(204)
    expect(calls).toEqual([['hide', 'c-1', 'm-admin', 'spam']])
  })

  it.each([{}, { reason: 'boring' }])(
    'refuses a hiding without a known reason: %o',
    async (body) => {
      const { app, calls } = setup()

      const response = await request(app)
        .post('/api/admin/challenges/c-1/hide')
        .set('Cookie', await cookieFor('m-admin'))
        .send(body)

      expect(response.status).toBe(400)
      expect(calls).toEqual([])
    },
  )

  it('answers 404 for a challenge already hidden or gone', async () => {
    const response = await request(setup().app)
      .post('/api/admin/challenges/c-9/hide')
      .set('Cookie', await cookieFor('m-admin'))
      .send({ reason: 'other' })

    expect(response.status).toBe(404)
  })

  it.each([
    ['c-1', 204],
    ['c-9', 404],
  ])('unhides %s with %i', async (id, status) => {
    const response = await request(setup().app)
      .post(`/api/admin/challenges/${id}/unhide`)
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(status)
  })

  it('shows a member without challenge:moderate nothing, and changes nothing (R-ROLE-3, R-NAV-8)', async () => {
    const { app, calls } = setup()
    const cookie = await cookieFor('m-member')

    const list = await request(app)
      .get('/api/admin/members/m-rik/challenges')
      .set('Cookie', cookie)
    const hide = await request(app)
      .post('/api/admin/challenges/c-1/hide')
      .set('Cookie', cookie)
      .send({ reason: 'spam' })
    const unhide = await request(app)
      .post('/api/admin/challenges/c-1/unhide')
      .set('Cookie', cookie)

    expect([list.status, hide.status, unhide.status]).toEqual([404, 404, 404])
    expect(calls).toEqual([])
  })
})
