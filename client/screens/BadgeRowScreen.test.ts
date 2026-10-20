// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RowView } from '../lib/badges'

const replace = vi.fn()
let params: Record<string, string> = { row: 'speak' }
vi.mock('vue-router', () => ({
  useRoute: () => ({ params, path: `/badges/${params['row'] ?? ''}` }),
  useRouter: () => ({ replace }),
}))

const level = (
  n: number,
  earned: boolean,
  isNew = false,
): RowView['levels'][number] => ({
  level: n,
  name: ['Spark', 'Agitator', 'Firebrand'][n - 1]!,
  needs: [1, 5, 10][n - 1]!,
  earnedAt: earned ? '2026-11-08T10:00:00.000Z' : null,
  new: isNew,
})

const speak = (over: Partial<RowView> = {}): RowView => ({
  row: 'speak',
  title: 'Speak up',
  counts: ['challenge posted', 'challenges posted'],
  explains: 'Each challenge you post counts once its topic is set.',
  count: 7,
  levels: [level(1, true), level(2, true, true), level(3, false)],
  crown: { name: 'Ringleader', held: false, new: false },
  ...over,
})

function serve(rows: RowView[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/badges'
        ? { ok: true, status: 200, json: () => Promise.resolve({ rows }) }
        : { ok: true, status: 204 },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const { default: BadgeRowScreen } = await import('./BadgeRowScreen.vue')
  const screen = mount(BadgeRowScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
  params = { row: 'speak' }
})

describe('BadgeRowScreen (S36, R-BADGE-8)', () => {
  it('shows the best badge, the count, and the progress to the next level', async () => {
    serve([speak()])
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Agitator')
    expect(screen.text()).toContain('7 challenges posted so far.')
    const bar = screen.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('7')
    expect(bar.attributes('aria-valuemax')).toBe('10')
    expect(screen.text()).toContain('3 more to go.')
  })

  it('lists every level and the crown, saying only whether it is theirs', async () => {
    serve([speak()])
    const screen = await mountScreen()

    const rungs = screen.findAll('.rung').map((rung) => rung.text())
    expect(rungs).toHaveLength(4)
    expect(rungs[0]).toContain('Earned 8 November 2026')
    expect(rungs[2]).toContain('Firebrand')
    expect(rungs[2]).toContain('7 of 10')
    expect(rungs[3]).toContain('Ringleader')
    expect(rungs[3]).toContain('Not yours yet')
    expect(screen.text()).toContain('Each challenge you post counts')
  })

  it('shows the crown when held, and no next level once all are earned', async () => {
    serve([
      speak({
        count: 12,
        levels: [level(1, true), level(2, true), level(3, true)],
        crown: { name: 'Ringleader', held: true, new: false },
      }),
    ])
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Ringleader')
    expect(screen.find('[role="progressbar"]').exists()).toBe(false)
    expect(screen.findAll('.rung')[3]!.text()).toContain('Yours, for now')
  })

  it('marks the row seen when something in it is new (R-BADGE-10)', async () => {
    const fetchMock = serve([speak()])
    await mountScreen()

    const posts = fetchMock.mock.calls.filter(
      ([url]) => url === '/api/badges/seen',
    )
    expect(
      posts.map(([, init]) => JSON.parse(String((init as RequestInit).body))),
    ).toEqual([{ rows: ['speak'] }])
  })

  it('names the promotions reached and says nothing of how (R-BADGE-9)', async () => {
    params = { row: 'game' }
    const job = (
      n: number,
      name: string,
      earned: boolean,
    ): RowView['levels'][number] => ({
      level: n,
      name,
      needs: [1, 4, 7][n - 1]!,
      earnedAt: earned ? '2026-11-08T10:00:00.000Z' : null,
      new: false,
    })
    serve([
      speak({
        row: 'game',
        title: 'Promotions',
        counts: ['', ''],
        explains: '',
        count: 4,
        levels: [
          job(1, 'Team Lead', true),
          job(2, 'Manager', true),
          job(3, 'Director', false),
        ],
        crown: { name: 'Leader of the Revolution', held: false, new: false },
      }),
    ])
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Manager')
    expect(screen.find('.lede').exists()).toBe(false)
    expect(screen.find('[role="progressbar"]').exists()).toBe(false)
    expect(
      screen
        .findAll('.rung')
        .map((rung) => [
          rung.find('.rung-text').text(),
          rung.find('.status').text(),
        ]),
    ).toEqual([
      ['Team Lead', 'Reached'],
      ['Manager', 'Reached'],
      ['Director', 'Not yet'],
      ['Leader of the Revolution', 'Not yours yet'],
    ])
    expect(screen.text()).not.toContain('crown goes to')
  })

  it('answers an unknown row as not found (R-NAV-8)', async () => {
    params = { row: 'gossip' }
    serve([speak()])
    await mountScreen()

    expect(replace).toHaveBeenCalledWith({
      name: 'not-found',
      params: { pathMatch: ['badges', 'gossip'] },
    })
  })
})
