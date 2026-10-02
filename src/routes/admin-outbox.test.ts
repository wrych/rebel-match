import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { OutboxFilter, OutboxRow } from '../services/outbox-log.js'
import { adminOutboxRoutes } from './admin-outbox.js'

const config = loadConfig({
  DATABASE_URL: 'mysql://user:pw@localhost:3306/rebel_match',
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
const row: OutboxRow = {
  id: 'o1',
  to: 'ada@example.invalid',
  kind: 'magic_link',
  subject: 'Your sign-in link',
  bodyText: 'Sign in: [sign-in link removed from the log]',
  status: 'sent',
  error: null,
  createdAt: new Date('2026-11-08T10:00:00Z'),
  sentAt: new Date('2026-11-08T10:00:01Z'),
}

function setup(): { app: Express; filters: OutboxFilter[] } {
  const filters: OutboxFilter[] = []
  const app = express()
  app.use(
    adminOutboxRoutes({
      auth,
      config: { limits: { outboxPageSize: 100 } },
      outbox: {
        list: (filter) => {
          filters.push(filter)
          return Promise.resolve([row])
        },
      },
    }),
  )
  return { app, filters }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('GET /api/admin/outbox', () => {
  it('lists the log for a holder of outbox:read (R-MSG-5)', async () => {
    const { app, filters } = setup()

    const response = await request(app)
      .get('/api/admin/outbox')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(200)
    expect((response.body as { entries: unknown[] }).entries).toHaveLength(1)
    expect(filters).toEqual([{ limit: 100 }])
  })

  it('passes the recipient, status and limit filters through', async () => {
    const { app, filters } = setup()

    await request(app)
      .get('/api/admin/outbox?to=ada@example.invalid&status=failed&limit=5')
      .set('Cookie', await cookieFor('m-admin'))

    expect(filters).toEqual([
      { to: 'ada@example.invalid', status: 'failed', limit: 5 },
    ])
  })

  it.each(['status=lost', 'limit=0', 'limit=101', 'limit=abc'])(
    'rejects %s',
    async (query) => {
      const { app, filters } = setup()

      const response = await request(app)
        .get(`/api/admin/outbox?${query}`)
        .set('Cookie', await cookieFor('m-admin'))

      expect(response.status).toBe(400)
      expect(filters).toEqual([])
    },
  )

  it('is not found for a member without outbox:read (R-NAV-8)', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/admin/outbox')
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
  })

  it('is 401 for nobody', async () => {
    const { app } = setup()

    expect((await request(app).get('/api/admin/outbox')).status).toBe(401)
  })
})
