import { describe, expect, it } from 'vitest'
import {
  createAuth,
  createMemoryAuthStore,
  type LinkKind,
  type MemoryMember,
  type OutgoingLink,
  type SessionCookie,
} from '../auth/index.js'
import { loadConfig } from '../config.js'
import { configPolicy } from '../permissions.js'
import type { AnalyticsEvent } from './analytics.js'
import { createSignIn, type SignIn } from './sign-in.js'

const DAY = 86_400_000
const config = loadConfig({
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
})
const browser = { headers: {} }

interface Harness {
  signIn: SignIn
  auth: ReturnType<typeof createAuth>
  tokenFor: (kind?: LinkKind, next?: string) => Promise<string>
  advance: (ms: number) => void
  tracked: [string, AnalyticsEvent][]
  restored: string[]
}

function setup(member: MemoryMember): Harness {
  const clock = { now: new Date('2026-11-08T10:00:00Z') }
  const sent: OutgoingLink[] = []
  const tracked: [string, AnalyticsEvent][] = []
  const restored: string[] = []
  const auth = createAuth({
    policy: configPolicy,
    store: createMemoryAuthStore([member]),
    config,
    now: () => clock.now,
    deliver: (link) => {
      sent.push(link)
      return Promise.resolve()
    },
  })
  const signIn = createSignIn({
    auth,
    erasure: {
      restoreOwn: (memberId) => {
        restored.push(memberId)
        member.active = true
        return Promise.resolve(true)
      },
    },
    track: (memberId, event) => {
      tracked.push([memberId, event])
      return Promise.resolve()
    },
  })
  const tokenFor = async (
    kind: LinkKind = 'self_service',
    next?: string,
  ): Promise<string> => {
    await auth.issueLink(member.email, { kind, next })
    return new URL(sent.at(-1)!.url).hash.replace(/^#token=/, '')
  }
  const advance = (ms: number): void => {
    clock.now = new Date(clock.now.getTime() + ms)
  }
  return { signIn, auth, tokenFor, advance, tracked, restored }
}

function ada(active = true): MemoryMember {
  return {
    id: 'm-ada',
    email: 'ada@example.invalid',
    roles: ['member'],
    active,
  }
}

function holding(cookie: SessionCookie): { headers: { cookie: string } } {
  return { headers: { cookie: `${cookie.name}=${cookie.value}` } }
}

async function sessionOf(
  harness: Harness,
  token: string,
): Promise<SessionCookie> {
  const result = await harness.signIn(browser, token)
  if (!result.ok) throw new Error(`refused: ${result.reason}`)
  return result.cookie
}

describe('signing in with a link', () => {
  it('starts a session and gives the safe path to go next (R-AUTH-5)', async () => {
    const harness = setup(ada())

    const result = await harness.signIn(
      browser,
      await harness.tokenFor('self_service', '/matches'),
    )

    expect(result).toMatchObject({ ok: true, next: '/matches' })
    const cookie = (result as { cookie: SessionCookie }).cookie
    expect(await harness.auth.currentMember(holding(cookie))).toMatchObject({
      id: 'm-ada',
    })
  })

  it('sends an unsafe next path to the app root (R-NAV-6)', async () => {
    const harness = setup(ada())

    const result = await harness.signIn(
      browser,
      await harness.tokenFor('self_service', 'https://evil.example'),
    )

    expect(result).toMatchObject({ ok: true, next: '/' })
  })

  it('restores an account its member deleted, so the session finds them (ADR 0032)', async () => {
    const harness = setup(ada(false))

    const cookie = await sessionOf(harness, await harness.tokenFor('restore'))

    expect(harness.restored).toEqual(['m-ada'])
    expect(await harness.auth.currentMember(holding(cookie))).toMatchObject({
      id: 'm-ada',
    })
  })

  it('restores nothing on an ordinary sign-in', async () => {
    const harness = setup(ada())

    await sessionOf(harness, await harness.tokenFor())

    expect(harness.restored).toEqual([])
  })

  it('ends the session the browser held before (ADR 0034)', async () => {
    const harness = setup(ada())
    const earlier = await harness.auth.createSession('m-ada')

    const result = await harness.signIn(
      holding(earlier),
      await harness.tokenFor(),
    )

    expect(result.ok).toBe(true)
    expect(await harness.auth.currentMember(holding(earlier))).toBeNull()
  })

  it('tracks the sign-in, and not a refused link (R-ANA-1)', async () => {
    const harness = setup(ada())
    const token = await harness.tokenFor()

    await harness.signIn(browser, token)
    await harness.signIn(browser, token)

    expect(harness.tracked).toEqual([['m-ada', { name: 'login_completed' }]])
  })

  it('refuses an unknown token, restoring and tracking nothing', async () => {
    const harness = setup(ada(false))

    const result = await harness.signIn(browser, 'nope')

    expect(result).toEqual({ ok: false, reason: 'unknown' })
    expect(harness.restored).toEqual([])
    expect(harness.tracked).toEqual([])
  })

  it('refuses an expired keep-it link, restoring nothing', async () => {
    const harness = setup(ada(false))
    const token = await harness.tokenFor('restore')
    harness.advance(DAY)

    const result = await harness.signIn(browser, token)

    expect(result).toEqual({ ok: false, reason: 'expired' })
    expect(harness.restored).toEqual([])
  })

  it('refuses a used link (R-AUTH-6)', async () => {
    const harness = setup(ada())
    const token = await harness.tokenFor()
    await harness.signIn(browser, token)

    expect(await harness.signIn(browser, token)).toEqual({
      ok: false,
      reason: 'used',
    })
  })
})
