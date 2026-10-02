// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginScreen from './LoginScreen.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

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

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
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
})
