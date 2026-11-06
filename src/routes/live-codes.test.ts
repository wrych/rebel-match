import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { handleErrors } from '../app.js'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { LiveCodeService } from '../services/live-codes.js'
import { liveCodeRoutes } from './live-codes.js'

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

const code = {
  token: 't',
  showForSeconds: 30,
  usableUntil: '2026-11-08T10:00:40.000Z',
  connected: [],
}

function setup(connectCodes = 1, limited = false): Express {
  const service: LiveCodeService = {
    issue: () =>
      Promise.resolve(
        limited ? { result: 'limit' } : { result: 'issued', code },
      ),
    redeem: (_scanner, token) =>
      Promise.resolve(token === 'good' ? 'r-1' : null),
    purge: () => Promise.resolve(0),
  }
  const app = express()
  app.use(express.json())
  const settings = { limits: () => ({ ...config.limits, connectCodes }) }
  app.use(liveCodeRoutes({ auth, settings, liveCodes: service }))
  app.use(handleErrors)
  return app
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('live code routes (R-CODE-5..7)', () => {
  it('hands out a new code', async () => {
    const response = await request(setup())
      .post('/api/me/live-codes')
      .set('Cookie', await cookie())

    expect(response.status).toBe(201)
    expect(response.body).toEqual(code)
  })

  it('answers 429 past the minute’s limit', async () => {
    const response = await request(setup(1, true))
      .post('/api/me/live-codes')
      .set('Cookie', await cookie())

    expect(response.status).toBe(429)
  })

  it('redeems from the body, and 410 for any code that cannot be used', async () => {
    const app = setup()
    const good = await request(app)
      .post('/api/live-codes/redeem')
      .set('Cookie', await cookie())
      .send({ token: 'good' })
    const gone = await request(app)
      .post('/api/live-codes/redeem')
      .set('Cookie', await cookie())
      .send({ token: 'old' })

    expect(good.body).toEqual({ id: 'r-1' })
    expect(gone.status).toBe(410)
  })

  it.each(['/api/me/live-codes', '/api/live-codes/redeem'])(
    'answers %s as not found while codes are off (R-CODE-1)',
    async (path) => {
      const response = await request(setup(0))
        .post(path)
        .set('Cookie', await cookie())
        .send({ token: 'good' })

      expect(response.status).toBe(404)
    },
  )
})
