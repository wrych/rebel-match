// @vitest-environment jsdom
import {
  enableAutoUnmount,
  flushPromises,
  mount,
  RouterLinkStub,
} from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { forgetMe } from '../lib/session'
import MyCodeScreen from './MyCodeScreen.vue'

const route = reactive({
  path: '/me/code',
  query: {} as Record<string, string>,
})
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

function server(code: unknown, connectCodes = 1): ReturnType<typeof vi.fn> {
  const bodies: Record<string, unknown> = {
    '/api/config': {
      limits: { savedTickMs: 1500, connectCodes, liveCodeSeconds: 30 },
    },
    '/auth/me': { id: 'm1', name: 'Ada Lovelace', permissions: [] },
    '/api/me/profile-code': code,
    '/api/me/live-codes': {
      token: 'live-1',
      showForSeconds: 30,
      usableUntil: '2026-11-08T10:00:40.000Z',
      connected: [],
    },
  }
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      bodies[url] === null
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, json: async () => bodies[url] },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(MyCodeScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

const asked = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
  fetchMock.mock.calls.map(([url]) => String(url))

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  forgetMe()
  route.query = {}
})

describe('MyCodeScreen (S47, R-CODE-1, R-CODE-2)', () => {
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

  it('shows the live code on Connect now, with no Copy or Share, and makes no profile code (R-CODE-5)', async () => {
    route.query = { tab: 'now' }
    const fetchMock = server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()

    expect(screen.find('svg[aria-label="Live connect code"]').exists()).toBe(
      true,
    )
    expect(screen.text()).not.toContain('Copy link')
    expect(
      screen.findAll('button').map((button) => button.text()),
    ).not.toContain('Share')
    expect(asked(fetchMock)).not.toContain('/api/me/profile-code')
  })

  it('switches tabs through the address', async () => {
    server({ token: 'tok-1', enabled: true })
    const screen = await mountScreen()
    const now = screen
      .findAll('[role=tab]')
      .find((each) => each.text() === 'Connect now')
    await now?.trigger('click')

    expect(replace).toHaveBeenCalledWith({ query: { tab: 'now' } })
  })

  it('is not found while hosts have codes off, asking for no code (R-CODE-1)', async () => {
    route.query = { tab: 'now' }
    const fetchMock = server(null, 0)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'not-found' }),
    )
    expect(asked(fetchMock)).not.toContain('/api/me/profile-code')
    expect(asked(fetchMock)).not.toContain('/api/me/live-codes')
  })
})
