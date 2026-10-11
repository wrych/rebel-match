// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginScreen from './LoginScreen.vue'

enableAutoUnmount(afterEach)

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const solveHumanCheck = vi.fn()
vi.mock('../lib/human-check', () => ({
  solveHumanCheck: (...args: unknown[]) => solveHumanCheck(...args) as unknown,
}))

/** Answers the link requests in turn with `replies`, recording each body. */
function serverInTurn(replies: { status: number; body: unknown }[]): {
  bodies: Record<string, unknown>[]
} {
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { body?: string }) => {
      if (url === '/api/config')
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => config,
        })
      bodies.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>)
      const reply = replies.shift() ?? { status: 500, body: null }
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: async () => reply.body,
      })
    }),
  )
  return { bodies }
}

const config = { limits: {}, consentVersion: '2026-11-01' }

/** Answers `/api/config` with the config and the link request with `reply`,
 * recording what the screen sent. */
function server(reply: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/config'
        ? { ok: true, status: 200, json: async () => config }
        : { ok, status: ok ? 200 : 500, json: async () => reply },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function submit(
  screen: ReturnType<typeof mount>,
  email = 'ada@example.invalid',
): Promise<void> {
  await screen.find('input[type="email"]').setValue(email)
  await screen.find('form').trigger('submit')
  await flushPromises()
}

function respondWith(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 503,
      json: async () => body,
    }),
  )
}

/** Answers the reduced-motion query with `still`. */
function motion(still: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: still }))
}

beforeEach(() => {
  motion(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
  solveHumanCheck.mockReset()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('LoginScreen', () => {
  it('asks for an email and nothing else — no password anywhere (R-AUTH-8)', () => {
    respondWith({ limits: {}, consentVersion: '2026-11-01' })

    const screen = mount(LoginScreen)

    expect(screen.find('input[type="email"]').exists()).toBe(true)
    expect(screen.find('input[type="password"]').exists()).toBe(false)
  })

  it('reports the consent version once the server answers (R-CFG-2)', async () => {
    respondWith({ limits: {}, consentVersion: '2026-11-01' })

    const screen = mount(LoginScreen)
    await vi.waitFor(() => {
      expect(screen.text()).toContain('2026-11-01')
    })
  })

  it('says so plainly when the server is unreachable', async () => {
    respondWith(null, false)

    const screen = mount(LoginScreen)
    await vi.waitFor(() => {
      expect(screen.text()).toContain('not reachable')
    })
  })

  it('explains a dead link and offers a new one (R-AUTH-6)', () => {
    respondWith({ limits: {}, consentVersion: '2026-11-01' })
    window.history.replaceState(null, '', '/login?link=expired')

    const screen = mount(LoginScreen)

    expect(screen.find('[role="alert"]').text()).toContain('has expired')
  })

  it('confirms a deleted account (R-PROF-2)', () => {
    respondWith({ limits: {}, consentVersion: '2026-11-01' })
    window.history.replaceState(
      null,
      '',
      '/login?account=deleted&until=2026-11-04T10:00:00.000Z',
    )

    const text = mount(LoginScreen).find('[role="status"]').text()

    expect(text).toContain('hidden from everyone')
    expect(text).toContain('4 November 2026')
    expect(text).toContain('Changed your mind?')
  })

  it('shows no alert on an ordinary visit', () => {
    respondWith({ limits: {}, consentVersion: '2026-11-01' })

    expect(mount(LoginScreen).find('[role="alert"]').exists()).toBe(false)
  })

  it('keeps the button disabled until an address is typed', async () => {
    server({ state: 'check-email' })

    const screen = mount(LoginScreen)
    const button = screen.find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()

    await screen.find('input[type="email"]').setValue('ada@example.invalid')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('says check your email once a link is on its way (F1, R-AUTH-4)', async () => {
    server({ state: 'check-email' })
    const screen = mount(LoginScreen)

    await submit(screen)

    expect(screen.text()).toContain('Check your email')
    expect(screen.find('form').exists()).toBe(false)
  })

  it('carries next from the address bar to the server (R-NAV-5)', async () => {
    const fetchMock = server({ state: 'check-email' })
    window.history.replaceState(null, '', '/login?next=%2Fadmin%2Foutbox')
    const screen = mount(LoginScreen)

    await submit(screen)

    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === '/auth/request-link',
    ) as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'ada@example.invalid',
      next: '/admin/outbox',
    })
  })

  it('sends an applicant to the access-requested screen with their handle (F4)', async () => {
    server({ state: 'access-requested', handle: 'h.s' })
    const screen = mount(LoginScreen)

    await submit(screen, 'new@example.invalid')

    expect(push).toHaveBeenCalledWith('/access-requested')
    expect(sessionStorage.getItem('rm_applicant_handle')).toBe('h.s')
    expect(screen.text()).not.toContain('Check your email')
  })

  it('tells a rejected address plainly, promising no email (R-AUTH-13)', async () => {
    server({ state: 'not-approved' })
    const screen = mount(LoginScreen)

    await submit(screen, 'no@example.invalid')

    expect(screen.text()).toContain('was not approved')
    expect(screen.text()).not.toContain('Check your email')
    expect(push).not.toHaveBeenCalled()
  })

  it('keeps the form and says so when the request fails', async () => {
    server(null, false)
    const screen = mount(LoginScreen)

    await submit(screen)

    expect(screen.find('[role="alert"]').text()).toContain('did not go through')
    expect(screen.find('form').exists()).toBe(true)
  })

  it('forgets an earlier handle when a repeat request brings none', async () => {
    sessionStorage.setItem('rm_applicant_handle', 'someone-elses')
    server({ state: 'access-requested' })
    const screen = mount(LoginScreen)

    await submit(screen, 'new@example.invalid')

    expect(push).toHaveBeenCalledWith('/access-requested')
    expect(sessionStorage.getItem('rm_applicant_handle')).toBeNull()
  })

  it('carries the invite from the QR with the address (F15)', async () => {
    const fetchMock = server({ state: 'check-email' })
    window.history.replaceState(null, '', '/?invite=tok')
    const screen = mount(LoginScreen)

    await submit(screen, 'new@example.invalid')

    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === '/auth/request-link',
    ) as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'new@example.invalid',
      invite: 'tok',
    })
    expect(screen.text()).toContain('Check your email')
  })

  it('shows the invalid-invite notice when the invite was refused (R-INV-5)', async () => {
    server({ state: 'access-requested', handle: 'h.s', inviteRefused: true })
    window.history.replaceState(null, '', '/?invite=tok')
    const screen = mount(LoginScreen)

    await submit(screen, 'new@example.invalid')

    expect(push).toHaveBeenCalledWith('/access-requested?invite=invalid')
  })

  describe('within the abuse limits (R-NFR-8)', () => {
    const challenge = { parameters: { nonce: 'n' }, signature: 'sig' }

    it('solves the human check and asks again with the answer', async () => {
      const { bodies } = serverInTurn([
        { status: 200, body: { state: 'human-check', challenge } },
        { status: 200, body: { state: 'access-requested', handle: 'h.s' } },
      ])
      solveHumanCheck.mockResolvedValue('solved-payload')
      const screen = mount(LoginScreen)

      await submit(screen, 'new@example.invalid')

      expect(solveHumanCheck).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        challenge,
      )
      expect(bodies[1]).toEqual({
        email: 'new@example.invalid',
        altcha: 'solved-payload',
      })
      expect(push).toHaveBeenCalledWith('/access-requested')
    })

    it('says the check did not finish when it cannot be solved', async () => {
      const { bodies } = serverInTurn([
        { status: 200, body: { state: 'human-check', challenge } },
      ])
      solveHumanCheck.mockResolvedValue(null)
      const screen = mount(LoginScreen)

      await submit(screen, 'new@example.invalid')

      expect(bodies).toHaveLength(1)
      expect(screen.find('[role="alert"]').text()).toContain('did not finish')
    })

    it('asks only once, even if the server asks again', async () => {
      const { bodies } = serverInTurn([
        { status: 200, body: { state: 'human-check', challenge } },
        { status: 200, body: { state: 'human-check', challenge } },
      ])
      solveHumanCheck.mockResolvedValue('solved-payload')
      const screen = mount(LoginScreen)

      await submit(screen, 'new@example.invalid')

      expect(bodies).toHaveLength(2)
      expect(screen.find('[role="alert"]').text()).toContain('did not finish')
    })

    it('asks to try again later on a 429', async () => {
      serverInTurn([{ status: 429, body: { error: 'too_many_requests' } }])
      const screen = mount(LoginScreen)

      await submit(screen)

      expect(screen.find('[role="alert"]').text()).toContain('a little later')
      expect(screen.find('form').exists()).toBe(true)
    })
  })

  it('reports an invite open on the first press, and nothing without an invite (R-STAT-6, ADR 0039)', async () => {
    const fetchMock = server({ state: 'check-email' })
    sessionStorage.clear()
    window.history.replaceState(null, '', '/login')
    mount(LoginScreen)
    await flushPromises()
    window.dispatchEvent(new Event('pointerdown'))
    window.history.replaceState(null, '', '/?invite=poster-token')
    mount(LoginScreen)
    await flushPromises()
    const opened = (): unknown[][] =>
      fetchMock.mock.calls.filter(([url]) => url === '/auth/invite-opened')
    expect(opened()).toHaveLength(0)

    window.dispatchEvent(new Event('pointerdown'))

    expect(opened()).toHaveLength(1)
    expect(JSON.parse(String((opened()[0]?.[1] as RequestInit).body))).toEqual({
      invite: 'poster-token',
    })
  })

  describe('the mark (R-LOOK-5)', () => {
    async function mountFresh(): Promise<ReturnType<typeof mount>> {
      vi.resetModules()
      const { default: Fresh } = await import('./LoginScreen.vue')
      return mount(Fresh)
    }

    it('shows the mark beside the title', async () => {
      respondWith(config)

      const screen = await mountFresh()

      expect(screen.find('.masthead svg').exists()).toBe(true)
      expect(screen.find('.masthead h1').text()).toContain('Match')
    })

    it('plays its intro over a black layer that then clears', async () => {
      respondWith(config)
      const screen = await mountFresh()
      expect(screen.find('.rebel-mark-play').exists()).toBe(true)

      await screen.find('.intro').trigger('animationend')

      expect(screen.find('.intro').exists()).toBe(false)
    })

    it('plays the intro only once per page load', async () => {
      respondWith(config)
      ;(await mountFresh()).unmount()

      const again = mount((await import('./LoginScreen.vue')).default)

      expect(again.find('.intro').exists()).toBe(false)
      expect(again.find('.rebel-mark-play').exists()).toBe(false)
    })

    it('shows the mark at rest, with no intro, for reduced motion', async () => {
      respondWith(config)
      motion(true)

      const screen = await mountFresh()

      expect(screen.find('.masthead svg').exists()).toBe(true)
      expect(screen.find('.intro').exists()).toBe(false)
      expect(screen.find('.rebel-mark-play').exists()).toBe(false)
    })
  })
})
