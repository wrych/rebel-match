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
  linkFor: (next?: string) => Promise<string>
  advance: (ms: number) => void
}

function setup(): Harness {
  const clock = { now: new Date('2026-11-08T10:00:00Z') }
  const sent: OutgoingLink[] = []
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
  app.use(renewSessions(auth))
  app.use(
    authRoutes({
      auth,
      profiles: {
        profile: (id) => Promise.resolve(id === ada.id ? profile : null),
      },
    }),
  )
  const linkFor = async (next?: string): Promise<string> => {
    await auth.issueLink(ada.email, { kind: 'self_service', next })
    const url = new URL(sent.at(-1)!.url)
    return `${url.pathname}${url.search}`
  }
  const advance = (ms: number): void => {
    clock.now = new Date(clock.now.getTime() + ms)
  }
  return { app, auth, linkFor, advance }
}

function sessionCookie(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[]
  return header[0]!.split(';')[0]!
}

describe('GET /auth/verify', () => {
  it('signs the member in and sends them to their next path (R-AUTH-5, R-NAV-5)', async () => {
    const { app, linkFor } = setup()

    const response = await request(app).get(await linkFor('/matches'))

    expect(response.status).toBe(303)
    expect(response.headers['location']).toBe('/matches')
    expect(sessionCookie(response)).toMatch(/^rm_session=.+/)
  })

  it('sends a used link to the login screen to ask for another (R-AUTH-6)', async () => {
    const { app, linkFor } = setup()
    const link = await linkFor()
    await request(app).get(link)

    const response = await request(app).get(link)

    expect(response.headers['location']).toBe('/login?link=used')
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it.each([
    ['/auth/verify?token=nope', 'unknown'],
    ['/auth/verify', 'unknown'],
    [`/auth/verify?token=${'x'.repeat(600)}`, 'unknown'],
  ])('treats %s as an unknown link', async (path, reason) => {
    const { app } = setup()

    const response = await request(app).get(path)

    expect(response.headers['location']).toBe(`/login?link=${reason}`)
  })

  it('says an expired link has expired', async () => {
    const { app, linkFor, advance } = setup()
    const link = await linkFor()
    advance(DAY)

    const response = await request(app).get(link)

    expect(response.headers['location']).toBe('/login?link=expired')
  })
})

describe('GET /auth/me', () => {
  it('describes the signed-in member, roles and permissions included (R-ROLE-4)', async () => {
    const { app, linkFor } = setup()
    const login = await request(app).get(await linkFor())

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
    const { app, linkFor } = setup()
    const cookie = sessionCookie(await request(app).get(await linkFor()))

    const logout = await request(app).post('/auth/logout').set('Cookie', cookie)
    const me = await request(app).get('/auth/me').set('Cookie', cookie)

    expect(logout.status).toBe(204)
    expect(logout.headers['set-cookie']![0]).toMatch(/rm_session=;.*Expires=/)
    expect(me.status).toBe(401)
  })
})

describe('session renewal on every request', () => {
  it('refreshes the cookie once a day has passed (R-AUTH-7, ADR 0020)', async () => {
    const { app, linkFor, advance } = setup()
    const cookie = sessionCookie(await request(app).get(await linkFor()))

    const sameDay = await request(app).get('/auth/me').set('Cookie', cookie)
    advance(2 * DAY)
    const later = await request(app).get('/auth/me').set('Cookie', cookie)

    expect(sameDay.headers['set-cookie']).toBeUndefined()
    expect(sessionCookie(later)).toBe(cookie)
  })
})
