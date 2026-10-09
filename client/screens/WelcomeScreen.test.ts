// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

function signedIn(
  permissions: string[],
  pendingIncoming = 0,
  newConnections = 0,
): ReturnType<typeof vi.fn> {
  const bodies: Record<string, unknown> = {
    '/api/cockpit': { pendingIncoming, newConnections },
    '/api/config': { limits: { matchesPollSeconds: 60 } },
  }
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          bodies[url] ?? {
            id: 'a',
            name: 'Ada',
            onboarded: true,
            analyticsOptIn: false,
            roles: [],
            permissions,
          },
        ),
    }),
  )
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

  it('opens on the greeting and a one-line invitation (F3)', async () => {
    signedIn([])
    const screen = await mountWelcome()

    expect(screen.find('.kicker').exists()).toBe(false)
    expect(screen.find('.lede').text()).toBe(
      'Bring a challenge, or help someone with theirs.',
    )
  })

  it('leads to the member’s matches (F8)', async () => {
    signedIn([])
    const links = (await mountWelcome()).findAllComponents(RouterLinkStub)

    expect(links.map((link) => link.props('to') as unknown)).toContain(
      '/matches',
    )
  })

  it('badges the matches link with the requests waiting (R-MINE-4)', async () => {
    signedIn([], 2)
    const link = (await mountWelcome())
      .findAllComponents(RouterLinkStub)
      .find((each) => each.props('to') === '/matches')

    expect(link?.find('.badge').text()).toBe('2')
    expect(link?.attributes('aria-label')).toBe('Your matches, 2 new requests')
  })

  it('badges the matches link with new connections too (R-CONN-7)', async () => {
    signedIn([], 0, 1)
    const link = (await mountWelcome())
      .findAllComponents(RouterLinkStub)
      .find((each) => each.props('to') === '/matches')

    expect(link?.find('.badge').text()).toBe('1')
    expect(link?.attributes('aria-label')).toBe(
      'Your matches, 1 new connection',
    )
  })

  it('shows no badge when nothing is waiting (R-MINE-4)', async () => {
    signedIn([])
    const link = (await mountWelcome())
      .findAllComponents(RouterLinkStub)
      .find((each) => each.props('to') === '/matches')

    expect(link?.find('.badge').exists()).toBe(false)
    expect(link?.attributes('aria-label')).toBe('Your matches')
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
