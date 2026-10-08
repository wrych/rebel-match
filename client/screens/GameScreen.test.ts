// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gameDefaults } from '../../src/game/tuning'
import type { GameState } from '../lib/game'
import { applyMood } from '../lib/mood'
import GameScreen from './GameScreen.vue'

const replace = vi.fn()
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/9torevolution' }),
  useRouter: () => ({ replace, push }),
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
      return Promise.resolve({
        ok: url.includes('hints') || sharing < 300,
        status: url.includes('hints') ? 204 : sharing,
      })
    if (url === '/api/events') return Promise.resolve({ ok: true, status: 204 })
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

let touch = false
const mounted: ReturnType<typeof mount>[] = []

async function turn(way: 'landscape' | 'portrait'): Promise<void> {
  Object.assign(window, {
    innerWidth: way === 'landscape' ? 844 : 390,
    innerHeight: way === 'landscape' ? 390 : 844,
  })
  window.dispatchEvent(new Event('resize'))
  await flushPromises()
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('coarse') && touch,
  }))
  const screen = mount(GameScreen, {
    global: {
      stubs: { RouterLink: RouterLinkStub, PlayView: true, teleport: true },
    },
  })
  mounted.push(screen)
  await flushPromises()
  return screen
}

afterEach(async () => {
  for (const screen of mounted.splice(0)) screen.unmount()
  touch = false
  await turn('portrait')
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
    expect(screen.text()).toContain('17:00. Home time.')
    expect(screen.text()).toContain('Spirits crushed: 3 · 1:28')
    expect(screen.text()).toContain('#1 of 1')
    expect(
      screen.findAllComponents(RouterLinkStub).map((link) => link.props('to')),
    ).toContain('/9torevolution/leaderboard')
  })

  async function endDay(
    screen: ReturnType<typeof mount>,
    outcome: 'won' | 'lost',
  ): Promise<void> {
    await screen.find('button.btn-dark').trigger('click')
    screen
      .findComponent({ name: 'PlayView' })
      .vm.$emit('ended', { outcome, score: 1, seconds: 60 })
    await flushPromises()
  }

  function button(
    screen: ReturnType<typeof mount>,
    name: string,
  ): ReturnType<ReturnType<typeof mount>['find']> {
    const found = screen.findAll('button').find((b) => b.text() === name)
    if (found === undefined) throw new Error(`no button ${name}`)
    return found
  }

  it('shares the name on a new best and goes on to the next day (R-GAME-15)', async () => {
    applyMood('happy')
    const fetchMock = serve(state)
    const screen = await mountScreen()
    await endDay(screen, 'won')

    await button(screen, 'Share and continue').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/sharing',
      expect.objectContaining({ body: '{"shared":true}' }),
    )
    expect(screen.findComponent({ name: 'PlayView' }).props('level')).toBe(5)
  })

  it('offers a retry from the first day of the job after a loss', async () => {
    applyMood('happy')
    serve({ ...state, resumeLevel: 5 })
    const screen = await mountScreen()
    await endDay(screen, 'lost')

    expect(screen.text()).toContain('The rebels took over')
    expect(screen.text()).not.toContain('Share and continue')
    await button(screen, 'Retry').trigger('click')

    expect(screen.findComponent({ name: 'PlayView' }).props('level')).toBe(4)
  })

  it('goes back to the lobby on Leave, saying how the day went', async () => {
    applyMood('happy')
    serve(state)
    const screen = await mountScreen()
    await endDay(screen, 'won')

    await button(screen, 'Leave').trigger('click')

    expect(screen.text()).toContain('Day won.')
    expect(screen.text()).toContain('Start the day')
  })

  it('plays from the first day of an earlier job (R-GAME-16)', async () => {
    applyMood('happy')
    serve(state)
    const screen = await mountScreen()

    await screen.find('input[type="radio"][value="1"]').setValue(true)
    await screen.find('button.btn-dark').trigger('click')

    expect(screen.findComponent({ name: 'PlayView' }).props('level')).toBe(1)
  })

  it('offers the CEO a choice: be a rebel, or continue to the app (R-GAME-8)', async () => {
    applyMood('happy')
    serve({ ...state, resumeLevel: 15, highestLevel: 15 })
    const screen = await mountScreen()
    await endDay(screen, 'won')

    expect(screen.text()).toContain(
      'Every spirit crushed. The board is thrilled.',
    )
    await button(screen, 'Be a rebel').trigger('click')

    expect(screen.findComponent({ name: 'PlayView' }).props('level')).toBe(16)
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

  it('reports the game opened, and marks a hint seen once read (R-GAME-18, R-GAME-19)', async () => {
    applyMood('happy')
    const fetchMock = serve(state)
    const screen = await mountScreen()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events',
      expect.objectContaining({
        body: JSON.stringify({ event: 'game_opened', props: {} }),
      }),
    )
    await screen.find('button.btn-dark').trigger('click')
    const play = screen.findComponent({ name: 'PlayView' })
    expect(play.props('hints')).toEqual(['firstDay', 'meeting', 'cooler'])
    play.vm.$emit('seen', 'firstDay')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/hints/firstDay',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(screen.findComponent({ name: 'PlayView' }).props('hints')).toEqual([
      'meeting',
      'cooler',
    ])
  })

  describe('on a touch screen (ADR 0046)', () => {
    it('starts the day when the phone turns sideways, and asks for no button', async () => {
      applyMood('happy')
      touch = true
      serve(state)
      const screen = await mountScreen()

      expect(screen.text()).toContain('Turn your phone sideways to start')
      expect(screen.text()).not.toContain('Start the day')
      await turn('landscape')

      expect(screen.findComponent({ name: 'PlayView' }).props('level')).toBe(4)
    })

    it('pauses into the lobby upright, and carries the same day on', async () => {
      applyMood('happy')
      touch = true
      serve(state)
      const screen = await mountScreen()
      await turn('landscape')
      const first = screen.findComponent({ name: 'PlayView' }).props('seed')

      await turn('portrait')
      expect(screen.text()).toContain('Your day is paused')
      expect(screen.find('.stage').attributes('style')).toContain(
        'display: none',
      )
      await turn('landscape')

      expect(screen.findComponent({ name: 'PlayView' }).props('seed')).toBe(
        first,
      )
    })

    it('shows the results on the phone’s side, and starts the next day from there', async () => {
      applyMood('happy')
      touch = true
      serve(state)
      const screen = await mountScreen()
      await turn('landscape')
      screen
        .findComponent({ name: 'PlayView' })
        .vm.$emit('ended', { outcome: 'won', score: 2, seconds: 70 })
      await flushPromises()

      expect(screen.find('.stage .results-layer').text()).toContain(
        '17:00. Home time.',
      )
      await button(screen, 'Continue').trigger('click')

      expect(screen.findComponent({ name: 'PlayView' }).props('level')).toBe(5)
    })

    it('waits after Leave until the phone has been upright and turned again', async () => {
      applyMood('happy')
      touch = true
      serve(state)
      const screen = await mountScreen()
      await turn('landscape')
      screen
        .findComponent({ name: 'PlayView' })
        .vm.$emit('ended', { outcome: 'lost', score: 0, seconds: 70 })
      await flushPromises()
      await button(screen, 'Leave').trigger('click')
      await flushPromises()

      expect(screen.findComponent({ name: 'PlayView' }).exists()).toBe(false)
      await turn('portrait')
      await turn('landscape')
      expect(screen.findComponent({ name: 'PlayView' }).exists()).toBe(true)
    })

    it('never records a finished day twice when the results are left upright', async () => {
      applyMood('happy')
      touch = true
      const fetchMock = serve(state)
      const screen = await mountScreen()
      await turn('landscape')
      screen
        .findComponent({ name: 'PlayView' })
        .vm.$emit('ended', { outcome: 'won', score: 2, seconds: 70 })
      await flushPromises()
      await turn('portrait')

      expect(screen.text()).toContain('Your day is over')
      expect(screen.text()).not.toContain('Your day is paused')
      await button(screen, 'Back to the office').trigger('click')
      await flushPromises()

      const records = fetchMock.mock.calls.filter(
        ([url]) => url === '/api/game/days',
      )
      expect(records).toHaveLength(1)
      expect(screen.text()).toContain('Turn your phone sideways to start')
      await turn('landscape')
      expect(screen.findComponent({ name: 'PlayView' }).props('level')).toBe(5)
    })

    it('drops the results of a day the player went back from while it was recording', async () => {
      applyMood('happy')
      touch = true
      let answer: (value: unknown) => void = () => undefined
      const fetchMock = serve(state)
      const screen = await mountScreen()
      await turn('landscape')
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve
          }),
      )
      screen
        .findComponent({ name: 'PlayView' })
        .vm.$emit('ended', { outcome: 'won', score: 2, seconds: 70 })
      await turn('portrait')

      expect(screen.text()).toContain('Your day is over')
      await button(screen, 'Back to the office').trigger('click')
      answer({
        ok: true,
        status: 200,
        json: async () => ({ state, newBest: false, place: null }),
      })
      await flushPromises()

      expect(screen.find('.stage .results-layer').exists()).toBe(false)
      expect(
        fetchMock.mock.calls.filter(([url]) => url === '/api/game/days'),
      ).toHaveLength(1)
    })
  })
})
