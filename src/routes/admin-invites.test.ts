import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type {
  InviteService,
  InviteView,
  NewInvite,
} from '../services/invites.js'
import { adminInviteRoutes } from './admin-invites.js'

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
const listed: InviteView = {
  id: 'i-1',
  label: 'Main stage',
  validFrom: '2026-11-08T09:00:00.000Z',
  validUntil: '2026-11-08T21:00:00.000Z',
  maxUses: 400,
  uses: 3,
  state: 'active',
  joinUrl: 'http://localhost:5173/?invite=abc',
  createdBy: 'a@example.invalid',
  createdAt: '2026-11-08T08:00:00.000Z',
}

function setup(): { app: Express; created: [NewInvite, string][] } {
  const created: [NewInvite, string][] = []
  const invites: InviteService = {
    list: () => Promise.resolve([listed]),
    create: (input, by) => {
      created.push([input, by])
      return Promise.resolve(
        input.label === 'backwards'
          ? { result: 'bad_window' }
          : { result: 'created', invite: listed },
      )
    },
    revoke: (id) => Promise.resolve(id === 'i-1' ? 'revoked' : 'not_found'),
  }
  const app = express()
  app.use(express.json())
  app.use(adminInviteRoutes({ auth, invites, config }))
  return { app, created }
}

async function cookieFor(memberId: string): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}

describe('admin invite routes', () => {
  it('lists invites with their join URL (R-INV-9)', async () => {
    const response = await request(setup().app)
      .get('/api/admin/invites')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.body).toEqual({ invites: [listed] })
  })

  it('creates as the signed-in admin, parsing the window (R-INV-8,10)', async () => {
    const { app, created } = setup()

    const response = await request(app)
      .post('/api/admin/invites')
      .set('Cookie', await cookieFor('m-admin'))
      .send({
        label: '  Main stage ',
        validFrom: '2026-11-08T09:00:00Z',
        validUntil: '2026-11-08T21:00:00Z',
        maxUses: 50,
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ invite: listed })
    expect(created).toEqual([
      [
        {
          label: 'Main stage',
          validFrom: new Date('2026-11-08T09:00:00Z'),
          validUntil: new Date('2026-11-08T21:00:00Z'),
          maxUses: 50,
        },
        'm-admin',
      ],
    ])
  })

  it('answers 400 bad_window for a window that ends first', async () => {
    const response = await request(setup().app)
      .post('/api/admin/invites')
      .set('Cookie', await cookieFor('m-admin'))
      .send({ label: 'backwards' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad_window' })
  })

  it.each([
    {},
    { label: '  ' },
    { label: 'x'.repeat(121) },
    { label: 'A', maxUses: 0 },
    { label: 'A', maxUses: 1.5 },
    { label: 'A', validFrom: 'not a date' },
  ])('refuses %j without creating', async (body) => {
    const { app, created } = setup()

    const response = await request(app)
      .post('/api/admin/invites')
      .set('Cookie', await cookieFor('m-admin'))
      .send(body)

    expect(response.status).toBe(400)
    expect(created).toEqual([])
  })

  it('revokes, and 404s an unknown invite (R-INV-3)', async () => {
    const { app } = setup()
    const cookie = await cookieFor('m-admin')

    await request(app)
      .post('/api/admin/invites/i-1/revoke')
      .set('Cookie', cookie)
      .expect(204)
    await request(app)
      .post('/api/admin/invites/i-9/revoke')
      .set('Cookie', cookie)
      .expect(404)
  })

  it.each([
    ['get', '/api/admin/invites'],
    ['post', '/api/admin/invites'],
    ['post', '/api/admin/invites/i-1/revoke'],
  ] as const)(
    'hides %s %s from a member without invite:manage (R-NAV-8)',
    async (method, path) => {
      const { app, created } = setup()

      const response = await request(app)
        [method](path)
        .set('Cookie', await cookieFor('m-member'))
        .send({ label: 'A' })

      expect(response.status).toBe(404)
      expect(created).toEqual([])
    },
  )
})
