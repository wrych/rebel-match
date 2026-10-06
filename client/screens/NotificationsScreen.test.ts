// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotificationView } from '../lib/notifications'
import NotificationsScreen from './NotificationsScreen.vue'

const entry = (
  id: string,
  over: Partial<NotificationView> = {},
): NotificationView => ({
  id,
  kind: 'connection_request',
  at: '2026-10-06T08:00:00.000Z',
  isNew: false,
  name: 'Bea There',
  path: `/matches/requests/${id}`,
  trend: null,
  ...over,
})

function serve(
  pages: Record<string, NotificationView[]>,
  pageSize = 50,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/config')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ limits: { notificationsPageSize: pageSize } }),
      })
    if (url === '/api/notifications/seen')
      return Promise.resolve({ ok: true, status: 204 })
    const before = new URL(url, 'http://x').searchParams.get('before') ?? ''
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ notifications: pages[before] ?? [] }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(NotificationsScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

function seenPosts(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/notifications/seen')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NotificationsScreen', () => {
  it('lists each in one line, opening where it comes from (R-NOTE-5)', async () => {
    serve({
      '': [
        entry('r1', { isNew: true }),
        entry('r2', {
          kind: 'connection_accepted',
          path: '/matches/requests/r2/contact',
        }),
      ],
    })
    const screen = await mountScreen()

    const links = screen.findAllComponents(RouterLinkStub)
    expect(links.map((link) => link.props('to'))).toEqual([
      '/matches/requests/r1',
      '/matches/requests/r2/contact',
    ])
    expect(links[0]?.text()).toContain('Bea There wants to connect with you')
    expect(links[1]?.text()).toContain('Bea There accepted your request')
    expect(screen.find('time').attributes('datetime')).toBe(
      '2026-10-06T08:00:00.000Z',
    )
  })

  it('outlines what was new on this visit, and marks only that seen (R-NOTE-5)', async () => {
    const fetchMock = serve({
      '': [
        entry('r1', { isNew: true }),
        entry('r2'),
        entry('r3', { isNew: true }),
      ],
    })
    const screen = await mountScreen()

    expect(
      screen.findAll('.card-new').map((card) => card.attributes('href')),
    ).toHaveLength(2)
    expect(seenPosts(fetchMock)).toEqual([{ ids: ['r1', 'r3'] }])
  })

  it('says so when there is nothing yet', async () => {
    serve({ '': [] })
    const screen = await mountScreen()

    expect(screen.text()).toContain('Nothing yet.')
  })

  it('loads older ones a page at a time', async () => {
    serve(
      {
        '': [entry('r1', { at: '2026-10-06T08:00:00.000Z' })],
        r1: [entry('r0', { at: '2026-10-05T08:00:00.000Z' })],
      },
      1,
    )
    const screen = await mountScreen()

    await screen.find('button').trigger('click')
    await flushPromises()

    expect(screen.findAllComponents(RouterLinkStub)).toHaveLength(2)
  })

  it('says so when they cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    )
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
    expect(screen.text()).not.toContain('Nothing yet.')
  })
})
