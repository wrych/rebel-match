import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { EraseOutcome } from '../services/erasure.js'
import type { RosterMember, MemberDetail } from '../services/member-roster.js'
import { adminMemberRoutes } from './admin-members.js'

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

const listed: RosterMember = {
  id: 'm-member',
  email: 'm@example.invalid',
  name: 'Mia',
  jobTitle: 'Coach',
  org: 'Buurtzorg',
  sector: null,
  companySize: null,
  status: 'active',
  roles: ['member'],
  joinedAt: '2026-10-01T09:00:00.000Z',
}

const detail: MemberDetail = {
  ...listed,
  requestedName: null,
  requestedOrg: null,
  joinedVia: 'Summit 2026 — main stage',
  consentVersion: '2026-11-01',
  consentAt: '2026-10-01T09:05:00.000Z',
  analyticsOptIn: false,
  challenges: 2,
  requestsSent: 1,
  requestsReceived: 0,
}

function setup(outcome: EraseOutcome = 'erased'): {
  app: Express
  erased: string[]
} {
  const erased: string[] = []
  const app = express()
  app.use(
    adminMemberRoutes({
      auth,
      erasure: {
        erase: (memberId) => {
          erased.push(memberId)
          return Promise.resolve(outcome)
        },
      },
      roster: {
        list: () => Promise.resolve([listed]),
        detail: (id) => Promise.resolve(id === listed.id ? detail : null),
      },
    }),
  )
  return { app, erased }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('DELETE /api/admin/members/:id', () => {
  it('erases the member as an admin (R-NFR-7)', async () => {
    const { app, erased } = setup()

    const response = await request(app)
      .delete('/api/admin/members/m-gone')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(204)
    expect(erased).toEqual(['m-gone'])
  })

  it.each([
    ['not_found', 404],
    ['created_invites', 409],
    ['last_admin', 409],
  ] as const)('answers %s with %i', async (outcome, status) => {
    const { app } = setup(outcome)

    const response = await request(app)
      .delete('/api/admin/members/x')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(status)
    expect(response.body).toEqual({ result: outcome })
  })

  it('answers 404 to a member without member:delete (R-ROLE-5)', async () => {
    const { app, erased } = setup()

    const response = await request(app)
      .delete('/api/admin/members/m-admin')
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
    expect(erased).toEqual([])
  })

  it('answers 401 to nobody signed in', async () => {
    const { app, erased } = setup()

    const response = await request(app).delete('/api/admin/members/m-admin')

    expect(response.status).toBe(401)
    expect(erased).toEqual([])
  })
})

describe('GET /api/admin/members', () => {
  it('lists the roster to an admin (R-NFR-7)', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/admin/members')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ members: [listed] })
  })

  it('answers 404 to a member without member:delete (R-ROLE-5)', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/admin/members')
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
  })
})

describe('GET /api/admin/members/:id', () => {
  it('shows everything held about the member to an admin (R-MEM-2)', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/admin/members/m-member')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ member: detail })
  })

  it('is not found for an unknown member', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/admin/members/m-nobody')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(404)
  })

  it('is not found for a member without member:delete (R-NAV-8)', async () => {
    const { app } = setup()

    const response = await request(app)
      .get('/api/admin/members/m-member')
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
  })
})
