// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetMe } from '../lib/session'
import LiveCodeScreen from './LiveCodeScreen.vue'

const route = { path: '/c', hash: '#t=live-1' }
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

const member = {
  id: 'm1',
  name: 'Ada',
  onboarded: true,
  analyticsOptIn: false,
  roles: [],
  permissions: [],
}

function server(
  me: unknown,
  redeem: { status: number; body?: unknown },
  connectCodes = 1,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/config'
        ? {
            ok: true,
            status: 200,
            json: async () => ({ limits: { connectCodes } }),
          }
        : url === '/auth/me'
          ? me === null
            ? { ok: false, status: 401 }
            : { ok: true, status: 200, json: async () => me }
          : {
              ok: redeem.status < 300,
              status: redeem.status,
              json: async () => redeem.body,
            },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(LiveCodeScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  forgetMe()
  route.hash = '#t=live-1'
})

describe('LiveCodeScreen (R-CODE-6, R-CODE-7)', () => {
  it('connects at once and opens the contact, the token in the body', async () => {
    const fetchMock = server(member, { status: 200, body: { id: 'r1' } })
    await mountScreen()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/live-codes/redeem',
      expect.objectContaining({ body: JSON.stringify({ token: 'live-1' }) }),
    )
    expect(replace).toHaveBeenCalledWith('/matches/requests/r1/contact')
  })

  it('asks a visitor signed out to sign in, keeping nothing for after', async () => {
    const fetchMock = server(null, { status: 200, body: { id: 'r1' } })
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Sign in to use live connect codes')
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe('/login')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      '/api/live-codes/redeem',
    )
  })

  it.each([
    ['a code that cannot be used', '#t=old', 410],
    ['an address without a code', '', 200],
  ])('says the code has expired for %s', async (_what, hash, status) => {
    route.hash = hash
    server(member, { status })
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe(
      'This code has expired — ask for a fresh one',
    )
    expect(replace).not.toHaveBeenCalled()
  })

  it('is not found while hosts have codes off', async () => {
    server(member, { status: 404 })
    await mountScreen()

    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'not-found' }),
    )
  })

  it('is not found to a visitor signed out while hosts have codes off (R-CODE-1)', async () => {
    server(null, { status: 200 }, 0)
    const screen = await mountScreen()

    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'not-found' }),
    )
    expect(screen.text()).not.toContain('Sign in')
  })

  it('asks a member not yet onboarded to finish their profile', async () => {
    server({ ...member, onboarded: false }, { status: 200 })
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe(
      'Finish your profile to use live connect codes',
    )
    expect(screen.findComponent(RouterLinkStub).props('to')).toBe('/onboarding')
  })
})
