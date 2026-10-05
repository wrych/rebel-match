import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { adminWhitelistRoutes } from './admin-whitelist.js'

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

function setup(): { app: Express; calls: unknown[] } {
  const calls: unknown[] = []
  const app = express()
  app.use(express.json())
  app.use(
    adminWhitelistRoutes({
      auth,
      config: { limits: { whitelistBatchMax: 3, emailMaxChars: 320 } },
      whitelist: {
        add: (emails, actorId) => {
          calls.push({ emails, actorId })
          return Promise.resolve(
            emails.map((email) => ({ email, outcome: 'added' as const })),
          )
        },
      },
    }),
  )
  return { app, calls }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('POST /api/admin/whitelist', () => {
  it('adds normalised addresses as the signed-in admin (R-AUTH-1)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/whitelist')
      .set('Cookie', await cookieFor('m-admin'))
      .send({ emails: ['  Ada@Example.invalid ', 'ben@example.invalid'] })

    expect(response.status).toBe(200)
    expect(calls).toEqual([
      {
        emails: ['ada@example.invalid', 'ben@example.invalid'],
        actorId: 'm-admin',
      },
    ])
    expect(response.body).toEqual({
      results: [
        { email: 'ada@example.invalid', outcome: 'added' },
        { email: 'ben@example.invalid', outcome: 'added' },
      ],
    })
  })

  it.each([
    ['no list', {}],
    ['an empty list', { emails: [] }],
    ['a bad address', { emails: ['ada@example.invalid', 'not-an-email'] }],
    [
      'an address too long to store',
      {
        emails: [
          `${'a'.repeat(64)}@${Array(5).fill('b'.repeat(50)).join('.')}.test`,
        ],
      },
    ],
    [
      'too many addresses',
      {
        emails: ['a', 'b', 'c', 'd'].map((p) => `${p}@example.invalid`),
      },
    ],
  ])('refuses %s with 400 and adds nobody', async (_case, body) => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/whitelist')
      .set('Cookie', await cookieFor('m-admin'))
      .send(body)

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('answers 404 to a member without whitelist:manage (R-ROLE-5)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/whitelist')
      .set('Cookie', await cookieFor('m-member'))
      .send({ emails: ['x@example.invalid'] })

    expect(response.status).toBe(404)
    expect(calls).toEqual([])
  })

  it('answers 401 to nobody signed in', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/admin/whitelist')
      .send({ emails: ['x@example.invalid'] })

    expect(response.status).toBe(401)
  })
})
