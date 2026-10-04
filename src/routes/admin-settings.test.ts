import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuth, createMemoryAuthStore } from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import { adminSettingsRoutes } from './admin-settings.js'

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

function app(): Express {
  const server = express()
  server.use(adminSettingsRoutes({ auth, config }))
  return server
}

async function cookieFor(memberId: string): Promise<string> {
  const cookie = await auth.createSession(memberId)
  return `${cookie.name}=${cookie.value}`
}

describe('GET /api/admin/settings', () => {
  it('shows the settings in groups to a holder of settings:read (R-CFG-5)', async () => {
    const response = await request(app())
      .get('/api/admin/settings')
      .set('Cookie', await cookieFor('m-admin'))

    expect(response.status).toBe(200)
    const body = response.body as { groups: { title: string }[] }
    expect(body.groups.map((group) => group.title)).toContain('Spam protection')
  })

  it('is not found for a member without settings:read (R-NAV-8)', async () => {
    const response = await request(app())
      .get('/api/admin/settings')
      .set('Cookie', await cookieFor('m-member'))

    expect(response.status).toBe(404)
  })

  it('refuses a visitor who is not signed in', async () => {
    const response = await request(app()).get('/api/admin/settings')

    expect(response.status).toBe(401)
  })
})
