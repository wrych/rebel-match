// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.vue'

const route = {
  path: '/offer',
  fullPath: '/offer',
  name: 'offer' as string,
  meta: { access: 'onboarded' } as Record<string, unknown>,
}
vi.mock('vue-router', () => ({ useRoute: () => route }))

function serve(
  pendingIncoming: number | null,
  newConnections = 0,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/config')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          feedbackTo: 'owner@example.org',
          limits: { matchesPollSeconds: 30 },
        }),
      })
    return Promise.resolve(
      pendingIncoming === null
        ? { ok: false, status: 500 }
        : {
            ok: true,
            status: 200,
            json: async () => ({
              challenges: [],
              following: [],
              pendingIncoming,
              newConnections,
            }),
          },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountBar(): Promise<ReturnType<typeof mount>> {
  const bar = mount(TabBar, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return bar
}

afterEach(() => {
  vi.unstubAllGlobals()
  route.path = '/offer'
  route.fullPath = '/offer'
  route.name = 'offer'
  route.meta = { access: 'onboarded' }
})

describe('TabBar', () => {
  it('badges Matches with the new requests (R-MINE-4)', async () => {
    serve(2)
    const bar = await mountBar()
    const matches = bar
      .findAllComponents(RouterLinkStub)
      .find((link) => link.props('to') === '/matches')

    expect(matches?.find('.badge').text()).toBe('2')
    expect(matches?.attributes('aria-label')).toBe('Matches, 2 new requests')
  })

  it('carries no badge on Matches itself, where all of it is in view (R-MINE-4)', async () => {
    route.path = '/matches'
    route.fullPath = '/matches'
    route.name = 'cockpit'
    serve(2, 1)
    const matches = (await mountBar())
      .findAllComponents(RouterLinkStub)
      .find((link) => link.props('to') === '/matches')

    expect(matches?.find('.badge').exists()).toBe(false)
    expect(matches?.attributes('aria-label')).toBe('Matches')
    expect(matches?.attributes('aria-current')).toBe('page')
  })

  it('keeps the badge on a screen under Matches, which records no visit (R-MINE-4)', async () => {
    route.path = '/matches/requests/r1'
    route.fullPath = '/matches/requests/r1'
    route.name = 'request'
    serve(2)
    const matches = (await mountBar())
      .findAllComponents(RouterLinkStub)
      .find((link) => link.props('to') === '/matches')

    expect(matches?.find('.badge').text()).toBe('2')
  })

  it('counts a request of theirs accepted but not opened yet (R-CONN-7)', async () => {
    serve(1, 1)
    const matches = (await mountBar())
      .findAllComponents(RouterLinkStub)
      .find((link) => link.props('to') === '/matches')

    expect(matches?.find('.badge').text()).toBe('2')
    expect(matches?.attributes('aria-label')).toBe(
      'Matches, 1 new request, 1 new connection',
    )
  })

  it('picks up a new request on its own, while the page is visible (R-MINE-4)', async () => {
    vi.useFakeTimers()
    let pending = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () =>
            url === '/api/config'
              ? {
                  feedbackTo: 'owner@example.org',
                  limits: { matchesPollSeconds: 30 },
                }
              : { challenges: [], following: [], pendingIncoming: pending },
        }),
      ),
    )
    const bar = await mountBar()
    expect(bar.find('.badge').exists()).toBe(false)

    pending = 1
    await vi.advanceTimersByTimeAsync(30_000)
    await flushPromises()

    expect(bar.find('.badge').text()).toBe('1')
    bar.unmount()
    vi.useRealTimers()
  })

  it('starts no timer when gone before the config arrived', async () => {
    vi.useFakeTimers()
    const fetchMock = serve(0)
    const bar = mount(TabBar, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    bar.unmount()
    await flushPromises()
    fetchMock.mockClear()

    await vi.advanceTimersByTimeAsync(90_000)

    expect(fetchMock).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('shows no badge when nothing waits, or the count cannot be read', async () => {
    serve(0)
    expect((await mountBar()).find('.badge').exists()).toBe(false)

    serve(null)
    expect((await mountBar()).find('.badge').exists()).toBe(false)
  })

  it('leads Home, an icon named for screen readers, to the welcome screen, first, and carries no Feedback', async () => {
    serve(0)
    const bar = await mountBar()
    const links = bar.findAllComponents(RouterLinkStub)

    expect(links.map((link) => link.props('to') as unknown)).toEqual([
      '/welcome',
      '/ask',
      '/offer',
      '/matches',
    ])
    expect(links[0]?.text()).toBe('')
    expect(links[0]?.attributes('aria-label')).toBe('Home')
    expect(links[0]?.classes()).toContain('tab-icon')
    expect(links[0]?.find('svg').attributes('aria-hidden')).toBe('true')
    expect(links[1]?.classes()).not.toContain('tab-icon')
    expect(bar.text()).not.toContain('Feedback')
  })

  it('stays away from the welcome screen and asks nothing there', async () => {
    const fetchMock = serve(1)
    route.name = 'welcome'

    expect((await mountBar()).find('nav').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stays away from screens before onboarding', async () => {
    serve(1)
    route.meta = { access: 'session' }
    route.name = 'onboarding'

    expect((await mountBar()).find('nav').exists()).toBe(false)
  })
})
