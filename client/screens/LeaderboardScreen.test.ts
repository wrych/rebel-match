// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Leaderboard } from '../lib/game'
import { applyMood } from '../lib/mood'
import LeaderboardScreen from './LeaderboardScreen.vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/9torevolution/leaderboard' }),
  useRouter: () => ({ replace }),
}))

const board: Leaderboard = {
  rows: [
    { place: 1, name: 'Ada Lovelace', job: 'rebel', level: 18, mine: false },
    { place: 2, name: 'Furious Rebel', job: 'ceo', level: 14, mine: false },
  ],
  own: { place: 9, name: 'Quiet Rebel', job: 'manager', level: 5, mine: true },
  of: 12,
}

const config = { limits: { leaderboardPollSeconds: 30 } }

function serve(answer: Leaderboard | null | (() => Leaderboard)): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/config'
          ? { ok: true, status: 200, json: async () => config }
          : answer === null
            ? { ok: false, status: 404 }
            : {
                ok: true,
                status: 200,
                json: async () =>
                  typeof answer === 'function' ? answer() : answer,
              },
      ),
    ),
  )
}

function gameReads(): unknown[] {
  return vi.mocked(fetch).mock.calls.filter(([url]) => url !== '/api/config')
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(LeaderboardScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  replace.mockClear()
  applyMood('calm')
  localStorage.clear()
})

describe('LeaderboardScreen (R-GAME-13, R-GAME-15)', () => {
  it('ranks the players by job and level, and marks the member’s own row below the top', async () => {
    applyMood('happy')
    serve(board)
    const screen = await mountScreen()
    const rows = screen.findAll('li')

    expect(rows.map((row) => row.text())).toEqual([
      expect.stringContaining('1Ada LovelaceRebel · level 18') as unknown,
      expect.stringContaining('2Furious RebelCEO · level 14') as unknown,
      expect.stringContaining('9Quiet RebelManager · level 5') as unknown,
    ])
    expect(rows[2]?.attributes('aria-current')).toBe('true')
    expect(screen.text()).toContain('12 players')
  })

  it('says the rebels only come out in happy mode, and asks nothing about the game', async () => {
    vi.useFakeTimers()
    serve(null)
    const screen = await mountScreen()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(screen.text()).toContain('only come out in happy mode')
    expect(gameReads()).toHaveLength(0)
    expect(replace).not.toHaveBeenCalled()
  })

  it('loads the board once the member switches to happy mode', async () => {
    serve(board)
    const screen = await mountScreen()

    applyMood('happy')
    await flushPromises()

    expect(screen.findAll('li')).toHaveLength(3)
  })

  it('answers as not found while the game is off (R-GAME-1)', async () => {
    applyMood('happy')
    serve(null)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'not-found' }),
    )
  })

  it('says when nobody has won a day yet', async () => {
    applyMood('happy')
    serve({ rows: [], own: null, of: 0 })
    const screen = await mountScreen()

    expect(screen.text()).toContain('Nobody has won a day yet')
  })

  it('outlines a new best that turns up while it is open, not a row that moved (R-NAV-12)', async () => {
    vi.useFakeTimers()
    applyMood('happy')
    let shown = board
    serve(() => shown)
    const screen = await mountScreen()
    expect(screen.find('.card-new').exists()).toBe(false)

    shown = {
      ...board,
      rows: [
        { place: 1, name: 'Bea Bold', job: 'rebel', level: 19, mine: false },
        { ...board.rows[0]!, place: 2 },
        { ...board.rows[1]!, place: 3 },
      ],
    }
    await vi.advanceTimersByTimeAsync(30_000)

    const fresh = screen.findAll('.card-new')
    expect(fresh).toHaveLength(1)
    expect(fresh[0]?.text()).toContain('Bea Bold')
    await fresh[0]?.trigger('click')
    expect(screen.find('.card-new').exists()).toBe(false)
    screen.unmount()
  })
})
