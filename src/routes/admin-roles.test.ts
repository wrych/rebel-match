import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { RoleService } from '../services/roles.js'
import { adminRoleRoutes } from './admin-roles.js'

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

interface Call {
  op: string
  args: string[]
}

function setup(
  grant: Awaited<ReturnType<RoleService['grant']>> = 'granted',
  revoke: Awaited<ReturnType<RoleService['revoke']>> = 'revoked',
): { app: Express; calls: Call[] } {
  const calls: Call[] = []
  const roles: RoleService = {
    grant: (...args) => {
      calls.push({ op: 'grant', args })
      return Promise.resolve(grant)
    },
    revoke: (...args) => {
      calls.push({ op: 'revoke', args })
      return Promise.resolve(revoke)
    },
  }
  const app = express()
  app.use(express.json())
  app.use(adminRoleRoutes({ auth, roles }))
  return { app, calls }
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('POST /api/admin/members/:id/roles', () => {
  it('grants as the signed-in admin (R-ROLE-7, R-ROLE-9)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/members/m-member/roles')
      .set('Cookie', await cookieFor('m-admin'))
      .send({ role: 'admin' })

    expect(response.status).toBe(204)
    expect(calls).toEqual([
      { op: 'grant', args: ['m-admin', 'm-member', 'admin'] },
    ])
  })

  it.each([
    ['unknown_role', 400],
    ['no_member', 404],
  ] as const)('answers %s with %i', async (outcome, status) => {
    const { app } = setup(outcome)

    const response = await request(app)
      .post('/api/admin/members/x/roles')
      .set('Cookie', await cookieFor('m-admin'))
      .send({ role: 'admin' })

    expect(response.status).toBe(status)
  })

  it('rejects a body without a role', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/members/m-member/roles')
      .set('Cookie', await cookieFor('m-admin'))
      .send({})

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('is not found for a member without role:grant (R-NAV-8)', async () => {
    const { app, calls } = setup()

    const response = await request(app)
      .post('/api/admin/members/m-member/roles')
      .set('Cookie', await cookieFor('m-member'))
      .send({ role: 'admin' })

    expect(response.status).toBe(404)
    expect(calls).toEqual([])
  })
})

describe('DELETE /api/admin/members/:id/roles/:role', () => {
  it.each([
    ['revoked', 204],
    ['unknown_role', 400],
    ['not_held', 404],
    ['last_holder', 409],
  ] as const)('answers %s with %i', async (outcome, status) => {
    const { app, calls } = setup('granted', outcome)

    const response = await request(app)
      .delete('/api/admin/members/m-admin/roles/admin')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(status)
    expect(calls).toEqual([{ op: 'revoke', args: ['m-admin', 'admin'] }])
  })
})
