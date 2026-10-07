// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gameDefaults } from '../../src/game/tuning'
import type { GameState } from '../lib/game'
import { applyMood } from '../lib/mood'
import GameScreen from './GameScreen.vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/9torevolution' }),
  useRouter: () => ({ replace }),
}))

const { enabled: _enabled, ...tuning } = gameDefaults
const state: GameState = {
  pseudonym: 'Furious Rebel',
  shared: false,
  resumeLevel: 4,
  highestLevel: 5,
  best: { level: 4, seconds: 400 },
  playFrom: [1, 4],
  hintsSeen: [],
  tuning,
}

function serve(
  game: GameState | null,
  sharing = 204,
  config = 200,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT')
      return Promise.resolve({ ok: sharing < 300, status: sharing })
    if (init?.method === 'POST')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          state: { ...state, resumeLevel: 5 },
          newBest: true,
          place: { position: 1, of: 1 },
        }),
      })
    if (url === '/api/config')
      return Promise.resolve({
        ok: config < 300,
        status: config,
        json: async () => ({ limits: { savedTickMs: 2500 } }),
      })
    return Promise.resolve(
      game === null
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, json: async () => game },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(GameScreen, {
    global: { stubs: { RouterLink: RouterLinkStub, PlayView: true } },
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

describe('GameScreen (R-GAME-1, R-GAME-15, R-GAME-16)', () => {
  it('greets the player by pseudonym, with the job they resume in', async () => {
    applyMood('happy')
    serve(state)
    const screen = await mountScreen()

    expect(screen.text()).toContain('Furious Rebel')
    expect(screen.text()).toContain('Next: Manager, day 1 · level 4')
    expect(screen.text()).toContain('Your best: level 4')
  })

  it('asks the server nothing in calm mode', async () => {
    const fetchMock = serve(state)
    const screen = await mountScreen()

    expect(screen.text()).toContain('only come out in happy mode')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers as not found while the game is off', async () => {
    applyMood('happy')
    serve(null)
    await mountScreen()

    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'not-found' }),
    )
  })

  it('shares the name on the leaderboard, and says so', async () => {
    applyMood('happy')
    const fetchMock = serve(state)
    const screen = await mountScreen()

    await screen.find('input[role="switch"]').setValue(true)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/sharing',
      expect.objectContaining({ method: 'PUT', body: '{"shared":true}' }),
    )
    expect(screen.find('[role="alert"]').exists()).toBe(false)
  })

  it('puts the switch back when sharing does not save', async () => {
    applyMood('happy')
    serve(state, 500)
    const screen = await mountScreen()
    const toggle = screen.find('input[role="switch"]')

    await toggle.setValue(true)
    await flushPromises()

    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(screen.find('[role="alert"]').text()).toContain('did not save')
  })

  it('keeps a saved choice even when the tick cannot be timed', async () => {
    applyMood('happy')
    serve(state, 204, 500)
    const screen = await mountScreen()
    const toggle = screen.find('input[role="switch"]')

    await toggle.setValue(true)
    await flushPromises()

    expect((toggle.element as HTMLInputElement).checked).toBe(true)
    expect(screen.find('[role="alert"]').exists()).toBe(false)
  })

  it('starts the day it resumes at, and records how it ended (R-GAME-14)', async () => {
    applyMood('happy')
    const fetchMock = serve(state)
    const screen = await mountScreen()

    await screen.find('button.btn-dark').trigger('click')
    const play = screen.findComponent({ name: 'PlayView' })
    expect(play.props('level')).toBe(4)
    play.vm.$emit('ended', { outcome: 'won', score: 3, seconds: 88 })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/days',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ level: 4, outcome: 'won', playSeconds: 88 }),
      }),
    )
    expect(screen.text()).toContain('Day won.')
    expect(screen.text()).toContain('level 5')
  })

  it('records a day left unfinished as abandoned', async () => {
    applyMood('happy')
    const fetchMock = serve(state)
    const screen = await mountScreen()

    await screen.find('button.btn-dark').trigger('click')
    screen.findComponent({ name: 'PlayView' }).vm.$emit('leave', 12)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/days',
      expect.objectContaining({
        body: JSON.stringify({
          level: 4,
          outcome: 'abandoned',
          playSeconds: 12,
        }),
      }),
    )
  })
})
