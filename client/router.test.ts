// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetMe, type Me } from './lib/session'
import { router } from './router'

const member: Me = {
  id: 'm-1',
  name: 'Ana',
  onboarded: true,
  analyticsOptIn: false,
  roles: ['member'],
  permissions: [],
}

function signedIn(me: Me): void {
  forgetMe()
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/auth/me'
          ? { ok: true, status: 200, json: async () => me }
          : { ok: true, status: 204, json: async () => ({}) },
      ),
    ),
  )
}

const claims = (): unknown[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => url === '/api/badges/claim')
    .map(([, init]) => JSON.parse(String(init?.body)))

function signedOut(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: async () => ({}) }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  forgetMe()
})

describe('router titles (R-NAV-13)', () => {
  it('names the screen in the tab after each navigation', async () => {
    signedOut()

    await router.push('/privacy')
    expect(document.title).toBe('Rebel Match | Privacy notice')

    await router.push('/terms')
    expect(document.title).toBe('Rebel Match | Terms of use')
  })

  it('names an address no screen serves as not found', async () => {
    signedOut()

    await router.push('/no-such-screen')

    expect(document.title).toBe('Rebel Match | Not found')
  })
})

describe('a link from a notification’s email (R-ANA-1)', () => {
  it('reports its kind once it may be seen, and drops the mark from the address', async () => {
    signedOut()

    await router.push('/privacy?section=data&notice=applicant')

    expect(router.currentRoute.value.fullPath).toBe('/privacy?section=data')
    const posted = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => url === '/api/events')
      .map(([, init]) => JSON.parse(String(init?.body)))
    expect(posted).toEqual([
      {
        event: 'notification_opened',
        props: { type: 'applicant', via: 'email' },
      },
    ])
  })
})

describe('a signed-in member opening an invite (R-BADGE-6)', () => {
  it('takes them home as ever, claiming its event badge', async () => {
    signedIn(member)

    await router.push('/?invite=tok-1')

    expect(router.currentRoute.value.path).toBe('/welcome')
    expect(claims()).toEqual([{ invite: 'tok-1' }])
  })

  it('claims nothing for a member still onboarding, nor without a token', async () => {
    signedIn({ ...member, onboarded: false })
    await router.push('/?invite=tok-2')
    signedIn(member)
    await router.push('/privacy')
    await router.push('/?invite=')

    expect(claims()).toEqual([])
  })
})

describe('each screen a member opens (R-ANA-1)', () => {
  const viewed = (): unknown[] =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => url === '/api/events')
      .map(([, init]) => JSON.parse(String(init?.body)))

  it('is reported once by its route name, never its path', async () => {
    signedIn(member)

    await router.push('/notifications')
    await router.push('/profile')

    expect(viewed()).toEqual([
      { event: 'screen_viewed', props: { screen: 'notifications' } },
      { event: 'screen_viewed', props: { screen: 'profile' } },
    ])
  })

  it('is counted only where it lands after a redirect', async () => {
    signedIn(member)

    await router.push('/')

    expect(viewed()).toEqual([
      { event: 'screen_viewed', props: { screen: 'welcome' } },
    ])
  })

  it('is not reported for a public screen or an address no screen serves', async () => {
    signedIn(member)

    await router.push('/privacy')
    await router.push('/no-such-screen')

    expect(viewed()).toEqual([])
  })
})
