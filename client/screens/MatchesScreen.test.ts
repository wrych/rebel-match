// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Challenge, Matches, Trend } from '../lib/challenges'
import MatchesScreen from './MatchesScreen.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'c1' } }) }))

const trend: Trend = {
  id: '02',
  short: 'Network of Teams',
  from: 'Pyramid',
  peers: 34,
}

const challenge: Challenge = {
  id: 'c1',
  memberId: 'm1',
  body: 'Nobody here knows who can decide what, and it hurts.',
  trendId: '02',
  autoTrend: '02',
  overridden: false,
  createdAt: '2026-10-03T09:00:00.000Z',
}

const matches: Matches = {
  trend,
  sameBoat: [
    {
      memberId: 'm2',
      name: 'Sam Boat',
      jobTitle: 'Lead',
      org: 'Acme',
      sector: null,
      note: 'Roles and circles, and nobody decides.',
    },
  ],
  beenThere: [
    {
      memberId: 'm3',
      name: 'Bea There',
      jobTitle: null,
      org: 'Buurtzorg',
      sector: 'Care',
      note: 'Teams of 12, no managers.',
    },
  ],
  cases: [
    {
      org: 'Haier',
      url: 'https://www.corporate-rebels.com/blog/haier-overview',
      takeaway: 'Thousands of micro-enterprises.',
    },
  ],
}

type Served = {
  found?: Matches | null
  followed?: Trend[]
  followStatus?: number
}

function json(body: unknown): Promise<object> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body })
}

/** Serves the challenge, its matches and the followed trends, and answers a
 * follow or unfollow with `followStatus`. */
function server(served: Served = {}): ReturnType<typeof vi.fn> {
  const { found = matches, followed = [], followStatus = 204 } = served
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method !== undefined)
      return Promise.resolve({ ok: followStatus < 300, status: followStatus })
    if (url === '/api/follows') return json({ trends: followed })
    if (found === null) return Promise.resolve({ ok: false, status: 404 })
    return url.endsWith('/matches') ? json(found) : json({ challenge })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(MatchesScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

function followButton(
  screen: ReturnType<typeof mount>,
): ReturnType<ReturnType<typeof mount>['find']> {
  return screen.find('button[aria-pressed]')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MatchesScreen', () => {
  it('shows the challenge and its three sections (R-ASK-8)', async () => {
    server()
    const text = (await mountScreen()).text()

    expect(text).toContain(challenge.body)
    expect(text).toContain('Same boat')
    expect(text).toContain('Sam Boat')
    expect(text).toContain('Been there')
    expect(text).toContain('Buurtzorg · Care')
    expect(text).toContain('Case studies')
    expect(text).toContain('Haier')
  })

  it('connects through the double opt-in screen, never by email (R-ASK-10)', async () => {
    server()
    const screen = await mountScreen()
    const links = screen.findAllComponents(RouterLinkStub)

    expect(links.map((link) => [link.text(), link.props('to')])).toEqual([
      ['Connect', '/challenges/c1/connect/m2?kind=same_boat'],
      ['Ask them', '/challenges/c1/connect/m3?kind=been_there'],
    ])
    expect(screen.html()).not.toContain('mailto:')
  })

  it('opens case studies in a new tab without handing over the page', async () => {
    server()
    const link = (await mountScreen()).find('a.case')

    expect(link.attributes('href')).toBe(matches.cases[0]?.url)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('says when a section has nobody yet', async () => {
    server({ found: { ...matches, sameBoat: [], beenThere: [], cases: [] } })
    const empties = (await mountScreen()).findAll('.empty')

    expect(empties).toHaveLength(3)
  })

  it('follows the trend, then unfollows it (R-ASK-9)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    expect(followButton(screen).attributes('aria-pressed')).toBe('false')
    await followButton(screen).trigger('click')
    await flushPromises()
    expect(followButton(screen).attributes('aria-pressed')).toBe('true')
    expect(followButton(screen).text()).toContain('Following')
    await followButton(screen).trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/follows/02', {
      method: 'POST',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/follows/02', {
      method: 'DELETE',
    })
    expect(followButton(screen).attributes('aria-pressed')).toBe('false')
  })

  it('shows a trend already followed as followed', async () => {
    server({ followed: [trend] })

    expect(followButton(await mountScreen()).attributes('aria-pressed')).toBe(
      'true',
    )
  })

  it('keeps the follow state when saving fails', async () => {
    server({ followStatus: 500 })
    const screen = await mountScreen()
    await followButton(screen).trigger('click')
    await flushPromises()

    expect(followButton(screen).attributes('aria-pressed')).toBe('false')
    expect(screen.find('[role="alert"]').text()).toContain('did not save')
  })

  it('shows nothing of a challenge that is not theirs (R-NAV-8)', async () => {
    server({ found: null })
    const screen = await mountScreen()

    expect(screen.find('.empty').text()).toContain('no challenge of yours')
    expect(screen.text()).not.toContain('Same boat')
  })

  it('says so when the matches cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
