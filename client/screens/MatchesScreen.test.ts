// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Challenge, Matches, Trend } from '../lib/challenges'
import MatchesScreen from './MatchesScreen.vue'

const route = { params: { id: 'c1' }, query: {} as Record<string, string> }
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

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
      companySize: null,
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
      companySize: null,
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
  shownFirst?: number | null
}

function json(body: unknown): Promise<object> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body })
}

/** Serves the challenge, its matches and the followed trends, and answers a
 * follow or unfollow with `followStatus`. */
function server(served: Served = {}): ReturnType<typeof vi.fn> {
  const {
    found = matches,
    followed = [],
    followStatus = 204,
    shownFirst = 1,
  } = served
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method !== undefined)
      return Promise.resolve({ ok: followStatus < 300, status: followStatus })
    if (url === '/api/follows') return json({ trends: followed })
    if (url === '/api/config')
      return shownFirst === null
        ? Promise.resolve({ ok: false, status: 500 })
        : json({ limits: { matchesShownFirst: shownFirst } })
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
  route.query = {}
  replace.mockClear()
})

describe('MatchesScreen', () => {
  it('shows the challenge and its three sections (R-ASK-8)', async () => {
    server()
    const text = (await mountScreen()).text()

    expect(text).toContain(challenge.body)
    expect(text).toContain('Sam Boat')
    expect(text).toContain('Buurtzorg · Care')
    expect(text).toContain('Haier')
  })

  it('names each section by its people and what to do (R-ASK-12)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('.kicker').text()).toBe(
      'Your challenge · Network of Teams',
    )
    expect(screen.find('h1').text()).toBe('Your matches')
    expect(screen.findAll('h2').map((heading) => heading.text())).toEqual([
      'Same boat: rebels facing this now',
      'Been there: rebels who’ve solved it',
      'Case studies',
    ])
    expect(screen.findAll('.purpose').map((line) => line.text())).toEqual([
      'Connect and compare notes.',
      'Ask how they did it.',
      'Read how they made the shift.',
    ])
  })

  it('shows the first of each section and folds the rest (R-ASK-15)', async () => {
    const more = (name: string, at: number): Matches['sameBoat'][number] => ({
      ...matches.sameBoat[0]!,
      memberId: `m-${String(at)}`,
      name,
    })
    server({
      found: {
        ...matches,
        sameBoat: [more('Ana', 1), more('Ben', 2), more('Cy', 3)],
        cases: [...matches.cases, { ...matches.cases[0]!, url: 'https://x' }],
      },
    })
    const screen = await mountScreen()
    const folds = (): string[] =>
      screen.findAll('button[aria-expanded]').map((each) => each.text())

    expect(screen.findAll('.peer-same_boat .peer')).toHaveLength(1)
    expect(screen.text()).toContain('Ana')
    expect(screen.text()).not.toContain('Ben')
    expect(screen.findAll('.case')).toHaveLength(1)
    expect(folds()).toEqual([
      '2 more rebels in the same boat',
      '1 more case study',
    ])

    await screen.find('button[aria-expanded]').trigger('click')

    expect(screen.findAll('.peer-same_boat .peer')).toHaveLength(3)
    expect(folds()).toEqual(['Show fewer', '1 more case study'])
    expect(
      screen.find('button[aria-expanded]').attributes('aria-expanded'),
    ).toBe('true')

    await screen.find('button[aria-expanded]').trigger('click')

    expect(screen.findAll('.peer-same_boat .peer')).toHaveLength(1)
  })

  it('folds nothing when the limit cannot be loaded', async () => {
    server({
      shownFirst: null,
      found: {
        ...matches,
        sameBoat: [
          ...matches.sameBoat,
          { ...matches.sameBoat[0]!, memberId: 'm9' },
        ],
      },
    })
    const screen = await mountScreen()

    expect(screen.findAll('.peer-same_boat .peer')).toHaveLength(2)
    expect(screen.find('button[aria-expanded]').exists()).toBe(false)
  })

  it('confirms the post on arrival from the trend step (R-ASK-11)', async () => {
    server()
    route.query = { posted: '1' }
    const screen = await mountScreen()

    expect(screen.find('[role="status"]').text()).toContain(
      'Your challenge is live.',
    )
    expect(screen.find('.steps').exists()).toBe(false)
    expect(replace).toHaveBeenCalledWith({ query: {} })
  })

  it('shows no banner when the member comes back later (R-ASK-11)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('[role="status"]').exists()).toBe(false)
    expect(screen.text()).not.toContain('Your challenge is live')
    expect(replace).not.toHaveBeenCalled()
  })

  it('connects through the double opt-in screen, never by email (R-ASK-10)', async () => {
    server()
    const screen = await mountScreen()
    const links = screen
      .findAllComponents(RouterLinkStub)
      .filter((link) => link.classes().includes('btn'))

    expect(links.map((link) => [link.text(), link.props('to')])).toEqual([
      ['Connect', '/challenges/c1/connect/m2?kind=same_boat'],
      ['Ask them', '/challenges/c1/connect/m3?kind=been_there'],
    ])
    expect(screen.html()).not.toContain('mailto:')
  })

  it('leads to the trend’s own screen (design S9)', async () => {
    server()
    const about = (await mountScreen())
      .findAllComponents(RouterLinkStub)
      .find((link) => link.text().startsWith('More on'))

    expect(about?.props('to')).toBe('/trends/02')
    expect(about?.text()).toBe('More on Network of Teams')
  })

  it('opens case studies in a new tab without handing over the page', async () => {
    server()
    const link = (await mountScreen()).find('a.case')

    expect(link.attributes('href')).toBe(matches.cases[0]?.url)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('points onward when nobody is here yet (R-ASK-13)', async () => {
    server({ found: { ...matches, sameBoat: [], beenThere: [], cases: [] } })
    const screen = await mountScreen()
    const empties = screen.findAll('.empty').map((empty) => empty.text())
    const onward = screen
      .findAllComponents(RouterLinkStub)
      .find((link) => link.props('to') === '/offer')

    expect(empties).toHaveLength(3)
    expect(empties[0]).toContain('Others will find your challenge')
    expect(empties[1]).toContain('Rebels who have will see your challenge')
    expect(onward?.text()).toBe('Help another rebel meanwhile')
    expect(screen.text()).not.toMatch(/notif|we.ll tell you/i)
  })

  it('offers no detour while there are rebels to meet', async () => {
    server()
    const links = (await mountScreen()).findAllComponents(RouterLinkStub)

    expect(links.some((link) => link.props('to') === '/offer')).toBe(false)
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
    expect(screen.text()).not.toContain('Rebels facing this now')
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
