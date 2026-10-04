import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Express } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp, handleErrors, type AppDeps } from './app.js'
import { createAuth, createMemoryAuthStore } from './auth/index.js'
import { loadConfig } from './config.js'
import type { Database } from './db/connect.js'
import { configPolicy } from './permissions.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
  MIXPANEL_TOKEN: 'mp-secret-token',
})

function deps(
  execute: () => Promise<unknown> = () => Promise.resolve({ rows: [] }),
): AppDeps {
  return {
    config,
    db: { execute } as unknown as Database,
    auth: createAuth({
      policy: configPolicy,
      store: createMemoryAuthStore([]),
      deliver: () => Promise.resolve(),
      config,
    }),
    profiles: { profile: () => Promise.resolve(null) },
    roles: {
      grant: () => Promise.resolve('no_member'),
      revoke: () => Promise.resolve('not_held'),
    },
    erasure: { erase: () => Promise.resolve('not_found') },
    analyticsConsent: { choose: () => Promise.resolve('done') },
    track: () => Promise.resolve(),
    roster: { list: () => Promise.resolve([]) },
    whitelist: { add: () => Promise.resolve([]) },
    outbox: {
      list: () => Promise.resolve([]),
      purgeBefore: () => Promise.resolve(0),
    },
    admission: {
      requestLink: () => Promise.resolve({ state: 'access-requested' }),
      describeApplicant: () => Promise.resolve('not-found'),
    },
    approvals: {
      listPending: () => Promise.resolve([]),
      approve: () => Promise.resolve('not_pending'),
      reject: () => Promise.resolve('not_pending'),
    },
    onboarding: {
      draft: () => Promise.resolve(null),
      complete: () => Promise.resolve('stale_consent'),
    },
    invites: {
      list: () => Promise.resolve([]),
      create: () => Promise.resolve({ result: 'bad_window' }),
      revoke: () => Promise.resolve('not_found'),
    },
    challenges: {
      trends: () => Promise.resolve([]),
      create: () => Promise.reject(new Error('unused')),
      get: () => Promise.resolve(null),
      confirmTrend: () => Promise.resolve('not_found'),
      matches: () => Promise.resolve(null),
      trend: () => Promise.resolve(null),
    },
    deck: { next: () => Promise.resolve([]) },
    connections: {
      request: () => Promise.resolve({ result: 'not_found' }),
      incoming: () => Promise.resolve([]),
      get: () => Promise.resolve(null),
      respond: () => Promise.resolve('not_found'),
      contact: () => Promise.resolve(null),
    },
    swipes: { swipe: () => Promise.resolve({ result: 'not_found' }) },
    follows: {
      follow: () => Promise.resolve('unknown_trend'),
      unfollow: () => Promise.resolve(),
      followed: () => Promise.resolve([]),
    },
    cockpit: {
      cockpit: () =>
        Promise.resolve({ challenges: [], following: [], pendingIncoming: 0 }),
    },
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
    expect(body).not.toContain('postgres://user:pw@localhost:5432')
  })
})

/** The app with one onboarded member signed in, and their cookie. */
async function signedIn(): Promise<{ app: Express; cookie: string }> {
  const auth = createAuth({
    policy: configPolicy,
    store: createMemoryAuthStore([
      { id: 'm-ada', email: 'ada@example.invalid', roles: ['member'] },
    ]),
    deliver: () => Promise.resolve(),
    config,
  })
  const session = await auth.createSession('m-ada')
  const app = createApp({
    ...deps(),
    auth,
    profiles: {
      profile: () =>
        Promise.resolve({
          name: 'Ada',
          onboarded: true,
          consentVersion: config.consentVersion,
          analyticsOptIn: false,
        }),
    },
  })
  return { app, cookie: `${session.name}=${session.value}` }
}

describe('unknown api routes', () => {
  it('answer 404 without describing what is missing', async () => {
    const { app, cookie } = await signedIn()

    const response = await request(app)
      .get('/api/members/42')
      .set('Cookie', cookie)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not_found' })
  })

  it('answer 404 and never 403, so nothing is confirmed (R-NAV-8)', async () => {
    const { app, cookie } = await signedIn()

    const response = await request(app)
      .post('/api/admin/secrets')
      .set('Cookie', cookie)

    expect(response.status).toBe(404)
  })

  it('answer 401 to nobody, like every guarded route (R-ROLE-5)', async () => {
    const response = await request(createApp(deps())).get('/api/members/42')

    expect(response.status).toBe(401)
  })
})

describe('the built client (ADR 0017)', () => {
  it('is left to Vite unless CLIENT_DIR is set', async () => {
    const response = await request(createApp(deps())).get('/matches')

    expect(response.status).toBe(404)
  })

  it('is served for screens, never for the API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'app-client-'))
    writeFileSync(join(dir, 'index.html'), '<div id="app"></div>')
    try {
      const app = createApp({
        ...deps(),
        config: { ...config, clientDir: dir },
      })

      const screen = await request(app).get('/matches')
      expect(screen.status).toBe(200)
      expect(screen.text).toContain('id="app"')

      const api = await request(app).get('/api/nothing-here')
      expect(api.status).toBe(401)
      expect(api.type).toBe('application/json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
      'postgres://user:pw@host/db query failed for member a@b.c',
    )
    const json = vi.fn()
    const response = { status: vi.fn().mockReturnValue({ json }) }

    handleErrors(leaky, {} as never, response as never, vi.fn() as never)

    expect(response.status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ error: 'internal_error' })
    expect(JSON.stringify(json.mock.calls)).not.toContain('a@b.c')
    expect(JSON.stringify(json.mock.calls)).not.toContain('postgres://')
  })
})
