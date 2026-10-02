// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginScreen from './LoginScreen.vue'

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
})
