// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Challenge, Trend } from '../lib/challenges'
import ChallengeScreen from './ChallengeScreen.vue'

const push = vi.fn()
const route = { params: { id: 'c1' }, query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => route,
}))

const trends: Trend[] = [
  { id: '01', short: 'Purpose & Values', from: 'Profit', peers: 12 },
  { id: '02', short: 'Network of Teams', from: 'Pyramid', peers: 34 },
  { id: '03', short: 'Radical Transparency', from: 'Secrecy', peers: 5 },
]

const challenge: Challenge = {
  id: 'c1',
  memberId: 'm1',
  body: 'Nobody here knows who can decide what, and it hurts.',
  trendId: null,
  autoTrend: '03',
  overridden: false,
  createdAt: '2026-10-03T09:00:00.000Z',
}

/** Serves the trends and `found` as the challenge, and answers the
 * confirmation with `status`. */
function server(
  found: Challenge | null = challenge,
  status = 204,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH')
      return Promise.resolve({ ok: status < 300, status })
    if (url === '/api/trends')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ trends }),
      })
    return Promise.resolve(
      found === null
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, json: async () => ({ challenge: found }) },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(ChallengeScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

async function confirm(screen: ReturnType<typeof mount>): Promise<void> {
  const button = screen
    .findAll('button')
    .find((each) => each.text() === 'Confirm')
  await button?.trigger('click')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
  route.query = {}
})

describe('ChallengeScreen', () => {
  it('shows the matched trend, where it moves from, and its peers (R-ASK-6)', async () => {
    server()
    const card = (await mountScreen()).text()

    expect(card).toContain('Trend 3 of 3')
    expect(card).toContain('Secrecy → Radical Transparency')
    expect(card).toContain('5 rebels work on this trend')
  })

  it('links to every trend so the member can override (R-ASK-6)', async () => {
    server()
    const link = (await mountScreen()).findComponent(RouterLinkStub)

    expect(link.props('to')).toBe('/challenges/c1/trend?current=03')
    expect(link.text()).toBe('See all 3 trends')
  })

  it('shows the trend picked on the trend screen instead', async () => {
    server()
    route.query = { trend: '01' }

    expect((await mountScreen()).text()).toContain('Profit → Purpose & Values')
  })

  it('stores the shown trend and goes on to the matches (R-ASK-7)', async () => {
    const fetchMock = server()
    route.query = { trend: '02' }
    await confirm(await mountScreen())

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/challenges/c1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ trendId: '02' }),
      }),
    )
    expect(push).toHaveBeenCalledWith('/challenges/c1/matches?posted=1')
  })

  it('says so when the trend did not save', async () => {
    server(challenge, 500)
    const screen = await mountScreen()
    await confirm(screen)

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
    expect(push).not.toHaveBeenCalled()
  })

  it('shows nothing of a challenge that is not theirs (R-NAV-8)', async () => {
    server(null)
    const screen = await mountScreen()

    expect(screen.find('.empty').text()).toContain('no challenge of yours')
    expect(screen.find('.trend-card').exists()).toBe(false)
  })

  it('says so when the challenge cannot be loaded', async () => {
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
