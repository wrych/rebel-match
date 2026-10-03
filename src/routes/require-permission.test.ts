import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const auth = createAuth({
  store: createMemoryAuthStore([
    { id: 'm-admin', email: 'a@example.invalid', roles: ['member', 'admin'] },
    { id: 'm-member', email: 'm@example.invalid', roles: ['member'] },
    { id: 'm-new', email: 'n@example.invalid', roles: ['moderator'] },
  ]),
  policy: configPolicy,
  deliver: () => Promise.resolve(),
  config,
})

function app(): Express {
  const server = express()
  server.get(
    '/admin/outbox',
    requirePermission(auth, 'outbox:read'),
    (_q, response) => {
      response.json({ caller: (response.locals as GuardedLocals).member.id })
    },
  )
  return server
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('requirePermission', () => {
  it('lets a member holding the permission through, naming them (R-ROLE-5)', async () => {
    const response = await request(app())
      .get('/admin/outbox')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ caller: 'm-admin' })
  })

  it('answers 404, not 403, to a member without it (R-NAV-8)', async () => {
    const response = await request(app())
      .get('/admin/outbox')
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not_found' })
  })

  it('denies a role the matrix does not know, rather than guess (R-ROLE-3)', async () => {
    const response = await request(app())
      .get('/admin/outbox')
      .set('Cookie', await cookieFor('m-new'))

    expect(response.status).toBe(404)
  })

  it('answers 401 to nobody', async () => {
    const response = await request(app()).get('/admin/outbox')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'unauthenticated' })
  })
})
