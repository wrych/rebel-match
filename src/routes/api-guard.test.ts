import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { guardApi } from './api-guard.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-done', email: 'd@example.invalid', roles: ['member'] },
    { id: 'm-new', email: 'n@example.invalid', roles: ['member', 'admin'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})

function app(): Express {
  const server = express()
  server.use(
    '/api',
    guardApi({
      auth,
      profiles: {
        profile: (id) =>
          Promise.resolve({
            name: id === 'm-done' ? 'Done' : null,
            onboarded: id === 'm-done',
            consentVersion: null,
          }),
      },
    }),
  )
  server.use('/api', (_request, response) => {
    response.json({ reached: true })
  })
  return server
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('guardApi', () => {
  it.each(['/api/health', '/api/config'])(
    'lets anyone reach %s',
    async (path) => {
      expect((await request(app()).get(path)).status).toBe(200)
    },
  )

  it.each(['/api/onboarding', '/api/admin/outbox', '/api/anything'])(
    'answers 401 to nobody at %s',
    async (path) => {
      expect((await request(app()).get(path)).status).toBe(401)
    },
  )

  it('lets a member who is not onboarded reach onboarding only (R-ONB-1)', async () => {
    const cookie = await cookieFor('m-new')

    const onboarding = await request(app())
      .post('/api/onboarding')
      .set('Cookie', cookie)
    const elsewhere = await request(app())
      .get('/api/admin/outbox')
      .set('Cookie', cookie)

    expect(onboarding.status).toBe(200)
    expect(elsewhere.status).toBe(403)
    expect(elsewhere.body).toEqual({ error: 'onboarding_required' })
  })

  it('refuses even an admin until onboarded, whatever their roles (R-NAV-7)', async () => {
    const response = await request(app())
      .get('/api/admin/applicants')
      .set('Cookie', await cookieFor('m-new'))

    expect(response.status).toBe(403)
  })

  it('lets an onboarded member through to the route', async () => {
    const response = await request(app())
      .get('/api/anything')
      .set('Cookie', await cookieFor('m-done'))

    expect(response.body).toEqual({ reached: true })
  })
})
