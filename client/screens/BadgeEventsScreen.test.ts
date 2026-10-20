// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventTicket from '../components/EventTicket.vue'
import type { EarnedEventBadge } from '../lib/badges'
import BadgeEventsScreen from './BadgeEventsScreen.vue'

const badge = (
  id: string,
  over: Partial<EarnedEventBadge> = {},
): EarnedEventBadge => ({
  id,
  name: `Badge ${id}`,
  ticketLine: 'SUMMIT',
  bigLine: '2026',
  hasLogo: false,
  earnedAt: '2026-11-08T10:00:00.000Z',
  new: false,
  ...over,
})

function serve(events: EarnedEventBadge[] | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/badges' && events !== null
        ? {
            ok: true,
            status: 200,
            json: () => Promise.resolve({ rows: [], events }),
          }
        : { ok: url === '/api/badges/seen', status: 500 },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(BadgeEventsScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

const seenPosts = (fetchMock: ReturnType<typeof vi.fn>): unknown[] =>
  fetchMock.mock.calls
    .filter(([url]) => url === '/api/badges/seen')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BadgeEventsScreen (S37, R-BADGE-8)', () => {
  it('lists each event badge with its ticket, name and the day it was earned', async () => {
    serve([badge('a', { hasLogo: true }), badge('b')])
    const screen = await mountScreen()

    const items = screen.findAll('li')
    expect(items.map((item) => item.find('.card-title').text())).toEqual([
      'Badge a',
      'Badge b',
    ])
    expect(items[0]?.text()).toContain('Earned 8 November 2026')
    const tickets = screen.findAllComponents(EventTicket)
    expect(tickets.map((ticket) => ticket.props('logo'))).toEqual([
      '/api/event-badges/a/logo.svg',
      null,
    ])
  })

  it('marks new ones seen, once shown (R-BADGE-10)', async () => {
    const fetchMock = serve([badge('a', { new: true })])
    const screen = await mountScreen()

    expect(screen.find('li').classes()).toContain('card-new')
    expect(seenPosts(fetchMock)).toEqual([{ rows: ['event'] }])
  })

  it('asks nothing to be marked with nothing new', async () => {
    const fetchMock = serve([badge('a')])
    await mountScreen()

    expect(seenPosts(fetchMock)).toEqual([])
  })

  it('says how to get one before there is any', async () => {
    serve([])
    const screen = await mountScreen()

    expect(screen.text()).toContain('None yet.')
  })

  it('says so when the badges cannot be loaded', async () => {
    serve(null)
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain('could not')
  })
})
