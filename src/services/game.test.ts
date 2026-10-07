import { describe, expect, it } from 'vitest'
import { gameDefaults } from '../game/tuning.js'
import { createGame } from './game.js'
import { createMemoryGameStore } from './game-memory-store.js'

function setup(): {
  store: ReturnType<typeof createMemoryGameStore>
  game: ReturnType<typeof createGame>
} {
  const store = createMemoryGameStore()
  let next = 0
  const game = createGame({
    store,
    settings: () => ({ ...gameDefaults, enabled: 1 }),
    allowance: { factor: 2, extraSeconds: 60 },
    newId: () => `d-${String((next += 1))}`,
    random: () => 0,
  })
  return { store, game }
}

describe('game service (R-GAME-14..16, R-GAME-20)', () => {
  it('creates a player with a pseudonym on the first call, and the tuning without the switch', async () => {
    const { game } = setup()

    const state = await game.state('m-ada')

    expect(state).toMatchObject({
      pseudonym: expect.stringMatching(/ Rebel$/) as unknown,
      shared: false,
      resumeLevel: 1,
      highestLevel: 1,
      best: null,
      playFrom: [1],
      hintsSeen: [],
    })
    expect(state.tuning).not.toHaveProperty('enabled')
    expect(state.tuning.dayLengthSeconds).toBe(90)
    expect((await game.state('m-ada')).pseudonym).toBe(state.pseudonym)
  })

  it('gives two players different pseudonyms', async () => {
    const { game } = setup()

    const ada = await game.state('m-ada')
    const bo = await game.state('m-bo')

    expect(bo.pseudonym).not.toBe(ada.pseudonym)
  })

  it('logs a won day, moves on and reports a new best with its place', async () => {
    const { game, store } = setup()

    const result = await game.recordDay('m-ada', {
      level: 1,
      outcome: 'won',
      playSeconds: 85,
    })

    expect(result).toMatchObject({
      newBest: true,
      place: { position: 1, of: 1 },
      state: {
        resumeLevel: 1,
        highestLevel: 2,
        best: { level: 1, seconds: 85 },
      },
    })
    expect(store.days).toEqual([
      {
        id: 'd-1',
        memberId: 'm-ada',
        level: 1,
        outcome: 'won',
        playSeconds: 85,
      },
    ])
  })

  it('resumes at the first day of the job after a loss', async () => {
    const { game } = setup()
    for (const level of [1, 2, 3, 4])
      await game.recordDay('m-ada', { level, outcome: 'won', playSeconds: 60 })

    const result = await game.recordDay('m-ada', {
      level: 5,
      outcome: 'lost',
      playSeconds: 40,
    })

    expect(result).toMatchObject({
      newBest: false,
      state: { resumeLevel: 4, highestLevel: 5, playFrom: [1, 4] },
    })
  })

  it('refuses a day that cannot have been played, and logs nothing', async () => {
    const { game, store } = setup()

    expect(
      await game.recordDay('m-ada', {
        level: 9,
        outcome: 'won',
        playSeconds: 60,
      }),
    ).toBe('implausible')
    expect(store.days).toEqual([])
  })

  it('shares the name and records a hint once', async () => {
    const { game } = setup()

    await game.share('m-ada', true)
    await game.seeHint('m-ada', 'firstDay')
    await game.seeHint('m-ada', 'firstDay')

    expect(await game.state('m-ada')).toMatchObject({
      shared: true,
      hintsSeen: ['firstDay'],
    })
  })

  it('gives up when every pseudonym it picks is taken meanwhile', async () => {
    const store = createMemoryGameStore()
    const game = createGame({
      store: { ...store, create: () => Promise.resolve(false) },
      settings: () => gameDefaults,
      allowance: { factor: 2, extraSeconds: 60 },
      newId: () => 'd',
    })

    await expect(game.state('m-ada')).rejects.toThrow('no free pseudonym')
  })
})
