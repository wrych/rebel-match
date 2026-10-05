import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import {
  createMemoryAuthStore,
  type MemoryAuthStore,
  type MemoryMember,
} from './memory-store.js'
import { createAuth } from './provider.js'
import type { AuthProvider, OutgoingLink, SessionCookie } from './types.js'
import { configPolicy } from '../permissions.js'

const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
  PUBLIC_URL: 'https://match.example.org',
})

const DAY = 86_400_000

const ada: MemoryMember = {
  id: 'm-ada',
  email: 'ada@example.invalid',
  roles: ['member', 'admin'],
}
const gone: MemoryMember = {
  id: 'm-gone',
  email: 'gone@example.invalid',
  roles: ['member'],
  active: false,
}

interface Harness {
  auth: AuthProvider
  store: MemoryAuthStore
  sent: OutgoingLink[]
  advance: (ms: number) => void
  tokenOf: (link: OutgoingLink) => string
}

function setup(start = new Date('2026-11-08T10:00:00Z')): Harness {
  const clock = { now: start }
  const sent: OutgoingLink[] = []
  const store = createMemoryAuthStore([ada, gone])
  const auth = createAuth({
    store,
    policy: configPolicy,
    config,
    now: () => clock.now,
    deliver: (link) => {
      sent.push(link)
      return Promise.resolve()
    },
  })
  const advance = (ms: number): void => {
    clock.now = new Date(clock.now.getTime() + ms)
  }
  const tokenOf = (link: OutgoingLink): string =>
    new URL(link.url).hash.replace(/^#token=/, '')

  return { auth, store, sent, advance, tokenOf }
}

function asRequest(cookie: SessionCookie): { headers: { cookie: string } } {
  return { headers: { cookie: `${cookie.name}=${cookie.value}` } }
}

describe('issueLink', () => {
  it('delivers a verify link for the member, under the public URL', async () => {
    const { auth, sent } = setup()

    await auth.issueLink('ada@example.invalid', { kind: 'self_service' })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ memberId: 'm-ada', kind: 'self_service' })
    expect(sent[0]!.url).toMatch(
      /^https:\/\/match\.example\.org\/sign-in#token=[\w-]{43}$/,
    )
  })

  it('stores only the hash of the token it sends (R-NFR-5)', async () => {
    const { auth, store, sent, tokenOf } = setup()

    await auth.issueLink('ada@example.invalid', { kind: 'self_service' })

    const raw = tokenOf(sent[0]!)
    expect(JSON.stringify(store.tokens)).not.toContain(raw)
  })

  it('refuses an address with no member, naming nobody', async () => {
    const { auth, sent } = setup()

    await expect(
      auth.issueLink('who@example.invalid', { kind: 'self_service' }),
    ).rejects.toThrow(/^issueLink: no member for address$/)
    expect(sent).toHaveLength(0)
  })
})

describe('verifyToken', () => {
  it('signs a member in once, and only once (R-AUTH-5)', async () => {
    const { auth, sent, tokenOf } = setup()
    await auth.issueLink('ada@example.invalid', { kind: 'self_service' })
    const raw = tokenOf(sent[0]!)

    expect(await auth.verifyToken(raw)).toEqual({
      ok: true,
      kind: 'self_service',
      memberId: 'm-ada',
      next: '/',
    })
    expect(await auth.verifyToken(raw)).toEqual({ ok: false, reason: 'used' })
  })

  it('refuses a self-service link after 15 minutes (R-AUTH-5)', async () => {
    const { auth, sent, advance, tokenOf } = setup()
    await auth.issueLink('ada@example.invalid', { kind: 'self_service' })

    advance(15 * 60_000)

    expect(await auth.verifyToken(tokenOf(sent[0]!))).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('keeps an approval link usable for its own lifetime (R-AUTH-10)', async () => {
    const { auth, sent, advance, tokenOf } = setup()
    await auth.issueLink('ada@example.invalid', { kind: 'approval' })

    advance(23 * 3_600_000)

    expect(await auth.verifyToken(tokenOf(sent[0]!))).toMatchObject({
      ok: true,
    })
  })

  it('calls a token it never issued unknown (R-AUTH-6)', async () => {
    const { auth } = setup()

    expect(await auth.verifyToken('not-a-token')).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('carries a known next path through the link (R-NAV-5)', async () => {
    const { auth, sent, tokenOf } = setup()
    await auth.issueLink('ada@example.invalid', {
      kind: 'self_service',
      next: '/matches/requests/r1',
    })

    expect(await auth.verifyToken(tokenOf(sent[0]!))).toMatchObject({
      next: '/matches/requests/r1',
    })
  })

  it('drops a next path that leaves the app (R-NAV-6)', async () => {
    const { auth, sent, tokenOf } = setup()
    await auth.issueLink('ada@example.invalid', {
      kind: 'self_service',
      next: 'https://evil.example/',
    })

    expect(await auth.verifyToken(tokenOf(sent[0]!))).toMatchObject({
      next: '/',
    })
  })

  it('lets only one of two racing verifications win', async () => {
    const { auth, sent, tokenOf } = setup()
    await auth.issueLink('ada@example.invalid', { kind: 'self_service' })
    const raw = tokenOf(sent[0]!)

    const results = await Promise.all([
      auth.verifyToken(raw),
      auth.verifyToken(raw),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
  })
})

describe('sessions', () => {
  it('resolves the caller with roles and permissions (R-ROLE-4)', async () => {
    const { auth } = setup()
    const cookie = await auth.createSession('m-ada')

    const member = await auth.currentMember(asRequest(cookie))

    expect(member?.id).toBe('m-ada')
    expect(member?.roles).toEqual(['member', 'admin'])
    expect(member?.permissions).toContain('outbox:read')
  })

  it('issues a secure, persistent cookie on an https deployment', async () => {
    const { auth } = setup()

    const cookie = await auth.createSession('m-ada')

    expect(cookie.options.secure).toBe(true)
    expect(cookie.options.maxAge).toBe(30 * DAY)
  })

  it('is nobody without a cookie, or with a tampered one', async () => {
    const { auth } = setup()
    const cookie = await auth.createSession('m-ada')

    expect(await auth.currentMember({ headers: {} })).toBeNull()
    expect(
      await auth.currentMember(
        asRequest({ ...cookie, value: `x${cookie.value}` }),
      ),
    ).toBeNull()
  })

  it('is nobody once the session has lived its lifetime', async () => {
    const { auth, advance } = setup()
    const cookie = await auth.createSession('m-ada')

    advance(30 * DAY)

    expect(await auth.currentMember(asRequest(cookie))).toBeNull()
  })

  it('keeps a member who keeps coming back signed in (R-AUTH-7)', async () => {
    const { auth, advance } = setup()
    const cookie = await auth.createSession('m-ada')

    for (let day = 0; day < 3; day += 1) {
      advance(20 * DAY)
      const renewed = await auth.renewSession(asRequest(cookie))
      expect(renewed).toMatchObject({ value: cookie.value })
      expect(renewed?.options.maxAge).toBe(30 * DAY)
    }

    expect((await auth.currentMember(asRequest(cookie)))?.id).toBe('m-ada')
  })

  it('renews at most once a day, so a session is not rewritten per request', async () => {
    const { auth, advance } = setup()
    const cookie = await auth.createSession('m-ada')

    advance(DAY - 1)
    expect(await auth.renewSession(asRequest(cookie))).toBeNull()

    advance(1)
    expect(await auth.renewSession(asRequest(cookie))).not.toBeNull()
  })

  it('does not revive a session idle for the whole period', async () => {
    const { auth, advance } = setup()
    const cookie = await auth.createSession('m-ada')

    advance(30 * DAY)

    expect(await auth.renewSession(asRequest(cookie))).toBeNull()
    expect(await auth.currentMember(asRequest(cookie))).toBeNull()
  })

  it('renews nothing without a valid session cookie', async () => {
    const { auth } = setup()
    const cookie = await auth.createSession('m-ada')

    expect(await auth.renewSession({ headers: {} })).toBeNull()
    expect(
      await auth.renewSession(
        asRequest({ ...cookie, value: `x${cookie.value}` }),
      ),
    ).toBeNull()
  })

  it('is nobody when the member is no longer active', async () => {
    const { auth } = setup()
    const cookie = await auth.createSession('m-gone')

    expect(await auth.currentMember(asRequest(cookie))).toBeNull()
  })

  it('ends the session on logout and clears the cookie (R-AUTH-7)', async () => {
    const { auth, store } = setup()
    const cookie = await auth.createSession('m-ada')

    const cleared = await auth.endSession(asRequest(cookie))

    expect(cleared).toMatchObject({ name: cookie.name, value: '' })
    expect(cleared.options.maxAge).toBe(0)
    expect(store.sessions).toHaveLength(0)
    expect(await auth.currentMember(asRequest(cookie))).toBeNull()
  })

  it('clears the cookie on logout even with no session', async () => {
    const { auth } = setup()

    expect((await auth.endSession({ headers: {} })).value).toBe('')
  })

  it('stores no session id an attacker could replay (R-NFR-5)', async () => {
    const { auth, store } = setup()
    const cookie = await auth.createSession('m-ada')
    const [raw] = cookie.value.split('.')

    expect(JSON.stringify(store.sessions)).not.toContain(raw)
  })

  it('round-trips through a real Express response and request', async () => {
    const { auth } = setup()
    const app = express()
    app.post('/in', async (_req, res) => {
      const cookie = await auth.createSession('m-ada')
      res.cookie(cookie.name, cookie.value, cookie.options).end()
    })
    app.get('/me', async (req, res) => {
      res.json(await auth.currentMember(req))
    })

    const login = await request(app).post('/in')
    const setCookie = login.headers['set-cookie'] as unknown as string[]
    const me = await request(app)
      .get('/me')
      .set('Cookie', setCookie[0]!.split(';')[0]!)

    expect(setCookie[0]).toMatch(/HttpOnly/)
    expect(setCookie[0]).toMatch(/SameSite=Lax/)
    expect((me.body as { id: string }).id).toBe('m-ada')
  })
})

describe('purgeExpired (ADR 0034)', () => {
  it('drops expired sessions and used or expired tokens, keeping the rest', async () => {
    const { auth, store, advance, sent, tokenOf } = setup()
    await auth.createSession('m-ada')
    await auth.issueLink(ada.email, { kind: 'self_service' })
    advance(31 * DAY)
    const live = await auth.createSession('m-ada')
    await auth.issueLink(ada.email, { kind: 'self_service' })
    await auth.verifyToken(tokenOf(sent.at(-1)!))
    await auth.issueLink(ada.email, { kind: 'self_service' })

    expect(await auth.purgeExpired()).toEqual({ sessions: 1, tokens: 2 })
    expect(store.sessions).toHaveLength(1)
    expect(store.tokens).toHaveLength(1)
    expect(
      await auth.currentMember({
        headers: { cookie: `${live.name}=${live.value}` },
      }),
    ).not.toBeNull()
  })
})
