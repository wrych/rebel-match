import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import {
  createAuth,
  createMemoryAuthStore,
  type AuthProvider,
  type OutgoingLink,
} from '../auth/index.js'
import { loadConfig } from '../config.js'
import type { MemberProfile } from '../services/member-profiles.js'
import { authRoutes, renewSessions } from './auth.js'
import { configPolicy } from '../permissions.js'
import type { AnalyticsEvent } from '../services/analytics.js'

const DAY = 86_400_000
const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const ada = { id: 'm-ada', email: 'ada@example.invalid', roles: ['member'] }
const profile: MemberProfile = {
  name: 'Ada',
  onboarded: true,
  consentVersion: '2026-11-01',
  analyticsOptIn: true,
}

interface Harness {
  app: Express
  auth: AuthProvider
  linkFor: (next?: string, kind?: 'self_service' | 'restore') => Promise<string>
  tokenFor: (
    next?: string,
    kind?: 'self_service' | 'restore',
  ) => Promise<string>
  signIn: (token: string) => request.Test
  advance: (ms: number) => void
  tracked: [string, AnalyticsEvent][]
  restored: string[]
}

function setup(): Harness {
  const clock = { now: new Date('2026-11-08T10:00:00Z') }
  const sent: OutgoingLink[] = []
  const tracked: [string, AnalyticsEvent][] = []
  const restored: string[] = []
  const auth = createAuth({
    policy: configPolicy,
    store: createMemoryAuthStore([ada]),
    config,
    now: () => clock.now,
    deliver: (link) => {
      sent.push(link)
      return Promise.resolve()
    },
  })
  const app = express()
  app.use(express.json())
  app.use(renewSessions(auth))
  app.use(
    authRoutes({
      auth,
      profiles: {
        profile: (id) => Promise.resolve(id === ada.id ? profile : null),
      },
      erasure: {
        restoreOwn: (memberId) => {
          restored.push(memberId)
          return Promise.resolve(true)
        },
      },
      track: (memberId, event) => {
        tracked.push([memberId, event])
        return Promise.resolve()
      },
    }),
  )
  const linkFor = async (
    next?: string,
    kind: 'self_service' | 'restore' = 'self_service',
  ): Promise<string> => {
    await auth.issueLink(ada.email, { kind, next })
    return sent.at(-1)!.url
  }
  const tokenFor = async (
    next?: string,
    kind: 'self_service' | 'restore' = 'self_service',
  ): Promise<string> =>
    new URL(await linkFor(next, kind)).hash.replace(/^#token=/, '')
  const signIn = (token: string): request.Test =>
    request(app).post('/auth/verify').send({ token })
  const advance = (ms: number): void => {
    clock.now = new Date(clock.now.getTime() + ms)
  }
  return { app, auth, linkFor, tokenFor, signIn, advance, tracked, restored }
}

function sessionCookie(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[]
  return header[0]!.split(';')[0]!
}

describe('the emailed link (ADR 0027)', () => {
  it('opens the sign-in screen, with the token only in the fragment', async () => {
    const { linkFor } = setup()

    const link = new URL(await linkFor())

    expect(link.pathname).toBe('/sign-in')
    expect(link.search).toBe('')
    expect(link.hash).toMatch(/^#token=[\w-]{43}$/)
  })
})

describe('GET /auth/verify (ADR 0034)', () => {
  it('is not served, so no token travels in a query string', async () => {
    const { app, tokenFor } = setup()

    const opened = await request(app).get(
      `/auth/verify?token=${await tokenFor()}`,
    )

    expect(opened.status).toBe(404)
  })
})

describe('POST /auth/verify', () => {
  it('ends the session the browser held before starting a new one (ADR 0034)', async () => {
    const { app, auth, signIn, tokenFor } = setup()
    const old = await auth.createSession(ada.id)
    const oldCookie = `${old.name}=${old.value}`

    const response = await signIn(await tokenFor()).set('Cookie', oldCookie)

    expect(response.status).toBe(200)
    expect(sessionCookie(response)).not.toBe(oldCookie)
    const before = await request(app).get('/auth/me').set('Cookie', oldCookie)
    expect(before.status).toBe(401)
  })

  it('signs the member in and says where to go next (R-AUTH-5, R-NAV-5)', async () => {
    const { tokenFor, signIn } = setup()

    const response = await signIn(await tokenFor('/matches'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ next: '/matches' })
    expect(sessionCookie(response)).toMatch(/^rm_session=.+/)
  })

  it('restores an account its member deleted before signing them in (ADR 0032)', async () => {
    const { tokenFor, signIn, restored } = setup()

    const response = await signIn(await tokenFor(undefined, 'restore'))

    expect(response.status).toBe(200)
    expect(restored).toEqual([ada.id])
  })

  it('restores nothing on an ordinary sign-in', async () => {
    const { tokenFor, signIn, restored } = setup()

    await signIn(await tokenFor())

    expect(restored).toEqual([])
  })

  it('reports the sign-in once, and not a refused link (R-ANA-1)', async () => {
    const { tokenFor, signIn, tracked } = setup()
    const token = await tokenFor()

    await signIn(token)
    await signIn(token)

    expect(tracked).toEqual([[ada.id, { name: 'login_completed' }]])
  })

  it('sends someone with no next path to the app root (R-NAV-6)', async () => {
    const { tokenFor, signIn } = setup()

    const response = await signIn(await tokenFor())

    expect(response.body).toEqual({ next: '/' })
  })

  it('refuses a used link, without a session (R-AUTH-6)', async () => {
    const { tokenFor, signIn } = setup()
    const token = await tokenFor()
    await signIn(token)

    const response = await signIn(token)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ reason: 'used' })
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it.each([
    [{ token: 'nope' }],
    [{}],
    [{ token: 'x'.repeat(600) }],
    [{ token: 42 }],
  ])('treats %j as an unknown link', async (body) => {
    const { app } = setup()

    const response = await request(app).post('/auth/verify').send(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ reason: 'unknown' })
  })

  it('says an expired link has expired', async () => {
    const { tokenFor, signIn, advance } = setup()
    const token = await tokenFor()
    advance(DAY)

    const response = await signIn(token)

    expect(response.body).toEqual({ reason: 'expired' })
  })
})

describe('GET /auth/me', () => {
  it('describes the signed-in member, roles and permissions included (R-ROLE-4)', async () => {
    const { app, tokenFor, signIn } = setup()
    const login = await signIn(await tokenFor())

    const response = await request(app)
      .get('/auth/me')
      .set('Cookie', sessionCookie(login))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id: 'm-ada',
      ...profile,
      roles: ['member'],
      permissions: [
        'challenge:create',
        'challenge:swipe',
        'connection:request',
        'game:play',
      ],
    })
  })

  it('is 401 for nobody, and leaks nothing', async () => {
    const { app } = setup()

    const response = await request(app).get('/auth/me')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'unauthenticated' })
  })
})

describe('POST /auth/logout', () => {
  it('ends the session and expires the cookie (R-AUTH-7)', async () => {
    const { app, tokenFor, signIn } = setup()
    const cookie = sessionCookie(await signIn(await tokenFor()))

    const logout = await request(app).post('/auth/logout').set('Cookie', cookie)
    const me = await request(app).get('/auth/me').set('Cookie', cookie)

    expect(logout.status).toBe(204)
    expect(logout.headers['set-cookie']![0]).toMatch(/rm_session=;.*Expires=/)
    expect(me.status).toBe(401)
  })
})

describe('session renewal on every request', () => {
  it('refreshes the cookie once a day has passed (R-AUTH-7, ADR 0020)', async () => {
    const { app, tokenFor, signIn, advance } = setup()
    const cookie = sessionCookie(await signIn(await tokenFor()))

    const sameDay = await request(app).get('/auth/me').set('Cookie', cookie)
    advance(2 * DAY)
    const later = await request(app).get('/auth/me').set('Cookie', cookie)

    expect(sameDay.headers['set-cookie']).toBeUndefined()
    expect(sessionCookie(later)).toBe(cookie)
  })
})
