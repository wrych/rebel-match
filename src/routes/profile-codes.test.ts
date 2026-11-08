import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { handleErrors } from '../app.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { ProfileCodeService } from '../services/profile-codes.js'
import { profileCodeRoutes } from './profile-codes.js'

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

const card = {
  memberId: 'm-ben',
  name: 'Ben',
  jobTitle: null,
  org: null,
  sector: null,
  companySize: null,
  photo: null,
  connectionId: null,
}

const asked: unknown[] = []
const service: ProfileCodeService = {
  mine: (memberId) => {
    asked.push(['mine', memberId])
    return Promise.resolve({ token: 't-1', enabled: true })
  },
  setEnabled: (memberId, enabled) => {
    asked.push(['setEnabled', memberId, enabled])
    return Promise.resolve({ token: 't-1', enabled })
  },
  reset: () => Promise.resolve({ token: 't-2', enabled: true }),
  open: (_callerId, token) =>
    Promise.resolve(token === 't-ben' ? { memberId: 'm-ben', card } : null),
}

function setup(connectCodes = 1): Express {
  const app = express()
  app.use(express.json())
  const settings = { limits: () => ({ ...config.limits, connectCodes }) }
  app.use(profileCodeRoutes({ auth, settings, profileCodes: service }))
  app.use(handleErrors)
  return app
}

async function cookie(): Promise<string> {
  const session = await auth.createSession('m-ada')
  return `${session.name}=${session.value}`
}

describe('profile code routes (R-CODE-2..4)', () => {
  it('gives the caller their code', async () => {
    const response = await request(setup())
      .get('/api/me/profile-code')
      .set('Cookie', await cookie())

    expect(response.body).toEqual({ token: 't-1', enabled: true })
    expect(asked).toContainEqual(['mine', 'm-ada'])
  })

  it('turns it on or off, and refuses anything but a boolean', async () => {
    const app = setup()
    const off = await request(app)
      .patch('/api/me/profile-code')
      .set('Cookie', await cookie())
      .send({ enabled: false })
    const bad = await request(app)
      .patch('/api/me/profile-code')
      .set('Cookie', await cookie())
      .send({ enabled: 'no' })

    expect(off.body).toEqual({ token: 't-1', enabled: false })
    expect(bad.status).toBe(400)
  })

  it('resets it to a new token', async () => {
    const response = await request(setup())
      .post('/api/me/profile-code/reset')
      .set('Cookie', await cookie())

    expect(response.body).toEqual({ token: 't-2', enabled: true })
  })

  it('opens a code from the body, and answers not found for any other', async () => {
    const app = setup()
    const found = await request(app)
      .post('/api/profile-codes/open')
      .set('Cookie', await cookie())
      .send({ token: 't-ben' })
    const missing = await request(app)
      .post('/api/profile-codes/open')
      .set('Cookie', await cookie())
      .send({ token: 't-none' })

    expect(found.body).toEqual({ memberId: 'm-ben', card })
    expect(missing.status).toBe(404)
  })

  it.each([
    ['get', '/api/me/profile-code'],
    ['patch', '/api/me/profile-code'],
    ['post', '/api/me/profile-code/reset'],
    ['post', '/api/profile-codes/open'],
  ] as const)(
    'answers %s %s as not found while codes are off (R-CODE-1)',
    async (method, path) => {
      const response = await request(setup(0))
        [method](path)
        .set('Cookie', await cookie())
        .send({ token: 't-ben', enabled: true })

      expect(response.status).toBe(404)
    },
  )
})
