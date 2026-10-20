// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BadgeOverview, RowView } from '../lib/badges'
import BadgesScreen from './BadgesScreen.vue'

const level = (
  n: number,
  earned: boolean,
  isNew = false,
): RowView['levels'][number] => ({
  level: n,
  name: `Level ${String(n)}`,
  needs: [1, 5, 10][n - 1]!,
  earnedAt: earned ? '2026-11-08T10:00:00.000Z' : null,
  new: isNew,
})

const row = (key: RowView['row'], over: Partial<RowView> = {}): RowView => ({
  row: key,
  title: `Row ${key}`,
  counts: ['thing', 'things'],
  explains: 'Each thing counts.',
  count: 0,
  levels: [level(1, false), level(2, false), level(3, false)],
  crown: { name: `Crown ${key}`, held: false, new: false },
  ...over,
})

const overview: BadgeOverview = {
  rows: [
    row('speak', {
      count: 6,
      levels: [level(1, true), level(2, true, true), level(3, false)],
    }),
    row('help'),
    row('boat'),
    row('connect', {
      count: 12,
      levels: [level(1, true), level(2, true), level(3, true)],
      crown: { name: 'Crown connect', held: true, new: false },
    }),
  ],
}

function serve(answer: BadgeOverview | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/badges' && answer !== null
        ? { ok: true, status: 200, json: () => Promise.resolve(answer) }
        : { ok: url === '/api/badges/seen', status: 500 },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(BadgesScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BadgesScreen (S35, R-BADGE-7)', () => {
  it('shows how many are earned and one tile per row, leading to its screen', async () => {
    serve(overview)
    const screen = await mountScreen()

    expect(screen.text()).toContain('6 earned')
    const tiles = screen.findAllComponents(RouterLinkStub)
    expect(tiles.map((tile) => tile.props('to'))).toEqual([
      '/badges/speak',
      '/badges/help',
      '/badges/boat',
      '/badges/connect',
    ])
    expect(tiles.map((tile) => tile.find('.name').text())).toEqual([
      'Level 2',
      'Level 1',
      'Level 1',
      'Crown connect',
    ])
  })

  it('names each tile for assistive technology, crown included', async () => {
    serve(overview)
    const screen = await mountScreen()

    const labels = screen
      .findAllComponents(RouterLinkStub)
      .map((tile) => tile.attributes('aria-label'))
    expect(labels[0]).toBe('Row speak: level 2 of 3')
    expect(labels[3]).toBe(
      'Row connect: level 3 of 3, and its crown, Crown connect',
    )
  })

  it('outlines a row with something new, and marks it seen (R-BADGE-10)', async () => {
    const fetchMock = serve(overview)
    const screen = await mountScreen()

    const first = screen.findAllComponents(RouterLinkStub)[0]!
    expect(first.classes()).toContain('card-new')
    expect(first.text()).toContain('New')
    const posts = fetchMock.mock.calls.filter(
      ([url]) => url === '/api/badges/seen',
    )
    expect(
      posts.map(([, init]) => JSON.parse(String((init as RequestInit).body))),
    ).toEqual([{ rows: ['speak'] }])
  })

  it('asks nothing to be marked with nothing new', async () => {
    const fetchMock = serve({ rows: [row('speak')] })
    await mountScreen()

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/badges'])
  })

  it('says so when the badges cannot be loaded', async () => {
    serve(null)
    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toBe(
      'Your badges could not be loaded. Try again.',
    )
  })
})
