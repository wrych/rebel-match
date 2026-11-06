// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetMe } from '../lib/session'
import MyCodeScreen from './MyCodeScreen.vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/me/code' }),
  useRouter: () => ({ replace }),
}))

function server(code: unknown): void {
  const bodies: Record<string, unknown> = {
    '/api/config': { limits: { savedTickMs: 1500 } },
    '/auth/me': { id: 'm1', name: 'Ada Lovelace', permissions: [] },
    '/api/me/profile-code': code,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        bodies[url] === null
          ? { ok: false, status: 404 }
          : { ok: true, status: 200, json: async () => bodies[url] },
      ),
    ),
  )
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(MyCodeScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  forgetMe()
})

describe('MyCodeScreen (S47, R-CODE-2)', () => {
  it('shows the profile code as a QR of its link, with the member’s name', async () => {
    server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()

    expect(screen.find('svg[role=img]').attributes('aria-label')).toBe(
      'Profile code of Ada Lovelace',
    )
    expect(screen.text()).toContain('Ada Lovelace')
    expect(screen.text()).toContain('Copy link')
    expect(screen.text()).toContain('Profile code: on')
  })

  it('says the code is off while it is', async () => {
    server({ token: 'tok-1', enabled: false })
    const screen = await mountScreen()

    expect(screen.text()).toContain('Your code is off')
  })

  it('is not found while hosts have codes off (R-CODE-1)', async () => {
    server(null)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'not-found' }),
    )
  })
})
