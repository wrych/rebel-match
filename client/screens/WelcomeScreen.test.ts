// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

function signedIn(permissions: string[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        id: 'a',
        name: 'Ada',
        onboarded: true,
        analyticsOptIn: false,
        roles: [],
        permissions,
      }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountWelcome(): Promise<ReturnType<typeof mount>> {
  vi.resetModules()
  const { default: WelcomeScreen } = await import('./WelcomeScreen.vue')
  const screen = mount(WelcomeScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

/** The admin screens offered, leaving out the journey doors. */
function adminPaths(screen: ReturnType<typeof mount>): unknown[] {
  return screen
    .findAllComponents(RouterLinkStub)
    .map((link) => link.props('to') as unknown)
    .filter((to) => String(to).startsWith('/admin/'))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WelcomeScreen', () => {
  it.each([
    ['/ask', 'ask'],
    ['/offer', 'offer'],
  ])(
    'reports the journey chosen through %s (R-ANA-1, ADR 0026)',
    async (to, journey) => {
      const fetchMock = signedIn([])
      const door = (await mountWelcome())
        .findAllComponents(RouterLinkStub)
        .find((link) => link.props('to') === to)

      await door?.trigger('click')

      const [, init] = fetchMock.mock.calls.find(
        ([url]) => url === '/api/events',
      ) as [string, RequestInit]
      expect(JSON.parse(init.body as string)).toEqual({
        event: 'journey_chosen',
        props: { journey },
      })
    },
  )

  it('greets the member by name', async () => {
    signedIn([])

    expect((await mountWelcome()).find('h1').text()).toBe('Welcome, Ada')
  })

  it('leads to the member’s matches (F8)', async () => {
    signedIn([])
    const links = (await mountWelcome()).findAllComponents(RouterLinkStub)

    expect(links.map((link) => link.props('to') as unknown)).toContain(
      '/matches',
    )
  })

  it('opens the Offer door onto the deck (F6)', async () => {
    signedIn([])
    const links = (await mountWelcome()).findAllComponents(RouterLinkStub)
    const door = links.find((link) => link.text().startsWith('Offer help'))

    expect(door?.props('to')).toBe('/offer')
  })

  it('opens the Ask door onto the Ask journey (F5)', async () => {
    signedIn([])
    const door = (await mountWelcome()).findComponent(RouterLinkStub)

    expect(door.props('to')).toBe('/ask')
    expect(door.text()).toContain('Ask for help')
  })

  it('leaves host tools and sign out to the header menu (R-PROF-3)', async () => {
    signedIn(['applicant:review', 'outbox:read'])
    const screen = await mountWelcome()

    expect(adminPaths(screen)).toEqual([])
    expect(screen.text()).not.toContain('Sign out')
  })
})
