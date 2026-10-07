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

function serve(answer: Leaderboard | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        answer === null
          ? { ok: false, status: 404 }
          : { ok: true, status: 200, json: async () => answer },
      ),
    ),
  )
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(LeaderboardScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
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

  it('says the rebels only come out in happy mode, and asks the server nothing', async () => {
    serve(null)
    const screen = await mountScreen()

    expect(screen.text()).toContain('only come out in happy mode')
    expect(fetch).not.toHaveBeenCalled()
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
})
