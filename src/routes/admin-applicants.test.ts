import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { ApprovalService, ApproveOutcome } from '../services/approvals.js'
import { adminApplicantRoutes } from './admin-applicants.js'

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
const pending = {
  id: 'm-ada',
  email: 'ada@example.invalid',
  requestedAt: '2026-10-03T09:00:00.000Z',
  name: 'Ada',
  org: 'Rebels',
}

function setup(approve: ApproveOutcome = 'approved'): {
  app: Express
  calls: string[][]
} {
  const calls: string[][] = []
  const approvals: ApprovalService = {
    listPending: () => Promise.resolve([pending]),
    approve: (...args) => {
      calls.push(['approve', ...args])
      return Promise.resolve(approve)
    },
    reject: (id) => {
      calls.push(['reject', id])
      return Promise.resolve(id === 'm-ada' ? 'rejected' : 'not_pending')
    },
  }
  const app = express()
  app.use(express.json())
  app.use(
    adminApplicantRoutes({
      auth,
      approvals,
      notifications: {
        openedApplicants: (memberId) => {
          calls.push(['opened', memberId])
          return Promise.resolve()
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

describe('admin applicant routes', () => {
  it('lists pending applicants for a reviewer (R-AUTH-11)', async () => {
    const response = await request(setup().app)
      .get('/api/admin/applicants')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ applicants: [pending] })
  })

  it('marks the reviewer’s applicant notifications seen, as this is where they lead (R-NOTE-5)', async () => {
    const { app, calls } = setup()

    await request(app)
      .get('/api/admin/applicants')
      .set('Cookie', await cookieFor('m-admin'))
      .expect(200)

    expect(calls).toEqual([['opened', 'm-admin']])
  })

  it('approves as the signed-in reviewer (R-AUTH-3)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/applicants/m-ada/approve')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(204)
    expect(calls).toEqual([['approve', 'm-ada', 'm-admin']])
  })

  it.each([
    ['not_pending', 404],
    ['link_failed', 502],
  ] as const)('answers %s with %i', async (outcome, status) => {
    const response = await request(setup(outcome).app)
      .post('/api/admin/applicants/m-ada/approve')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(status)
    expect(response.body).toEqual({ result: outcome })
  })

  it('rejects, and 404s an id no longer pending', async () => {
    const { app } = setup()
    const cookie = await cookieFor('m-admin')

    await request(app)
      .post('/api/admin/applicants/m-ada/reject')
      .set('Cookie', cookie)
      .expect(204)
    await request(app)
      .post('/api/admin/applicants/m-gone/reject')
      .set('Cookie', cookie)
      .expect(404)
  })

  it.each([
    ['get', '/api/admin/applicants'],
    ['post', '/api/admin/applicants/m-ada/approve'],
    ['post', '/api/admin/applicants/m-ada/reject'],
  ] as const)(
    'hides %s %s from a member without applicant:review (R-NAV-8)',
    async (method, path) => {
      const { app, calls } = setup()

      const response = await request(app)
        [method](path)
        .set('Cookie', await cookieFor('m-member'))

      expect(response.status).toBe(404)
      expect(calls).toEqual([])
    },
  )

  it('asks for a session first', async () => {
    const response = await request(setup().app).get('/api/admin/applicants')

    expect(response.status).toBe(401)
  })
})
