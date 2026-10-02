import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp, handleErrors, type AppDeps } from './app.js'
import { createAuth, createMemoryAuthStore } from './auth/index.js'
import { loadConfig } from './config.js'
import type { Pool } from './db.js'
import { configPolicy } from './permissions.js'

const config = loadConfig({
  DATABASE_URL: 'mysql://user:pw@localhost:3306/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
  MIXPANEL_TOKEN: 'mp-secret-token',
})

function deps(
  query: () => Promise<unknown> = () => Promise.resolve([[], []]),
): AppDeps {
  return {
    config,
    pool: { query } as unknown as Pool,
    auth: createAuth({
      policy: configPolicy,
      store: createMemoryAuthStore([]),
      deliver: () => Promise.resolve(),
      config,
    }),
    profiles: { profile: () => Promise.resolve(null) },
  }
}

describe('GET /api/health', () => {
  it('reports the database as up when it answers', async () => {
    const response = await request(createApp(deps())).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', database: 'up' })
  })

  it('still answers when the database is unreachable, and says so', async () => {
    const down = deps(() => Promise.reject(new Error('ECONNREFUSED')))

    const response = await request(createApp(down)).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', database: 'down' })
  })
})

describe('GET /api/config', () => {
  it('serves the limits the client needs (R-CFG-2)', async () => {
    const response = await request(createApp(deps())).get('/api/config')

    const body = response.body as {
      limits: { challengeMinChars: number }
      consentVersion: string
    }

    expect(body.limits.challengeMinChars).toBe(31)
    expect(body.consentVersion).toBe('2026-11-01')
  })

  it('leaks no secret, whatever the server holds', async () => {
    const response = await request(createApp(deps())).get('/api/config')
    const body = JSON.stringify(response.body)

    expect(body).not.toContain('mp-secret-token')
    expect(body).not.toContain(config.sessionSecret)
    expect(body).not.toContain(config.databaseUrl)
  })
})

describe('unknown api routes', () => {
  it('answer 404 without describing what is missing', async () => {
    const response = await request(createApp(deps())).get('/api/members/42')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not_found' })
  })

  it('answer 404 and never 403, so nothing is confirmed (R-NAV-8)', async () => {
    const response = await request(createApp(deps())).post('/api/admin/secrets')

    expect(response.status).toBe(404)
  })
})

describe('the error handler', () => {
  it('keeps a client error visible as a client error', async () => {
    const response = await request(createApp(deps()))
      .post('/api/config')
      .set('content-type', 'application/json')
      .send('{ not json')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad_request' })
  })

  it('says nothing about an unexpected failure (constitution §5)', () => {
    const leaky = new Error(
      'mysql://user:pw@host/db query failed for member a@b.c',
    )
    const json = vi.fn()
    const response = { status: vi.fn().mockReturnValue({ json }) }

    handleErrors(leaky, {} as never, response as never, vi.fn() as never)

    expect(response.status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ error: 'internal_error' })
    expect(JSON.stringify(json.mock.calls)).not.toContain('a@b.c')
    expect(JSON.stringify(json.mock.calls)).not.toContain('mysql://')
  })
})
