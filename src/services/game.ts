import {
  jobOf,
  firstDayOf,
  firstDaysUpTo,
  newProgress,
  plausible,
  progressAfter,
  type DayRecord,
  type Progress,
} from '../game/levels.js'
import { pickPseudonym } from '../game/pseudonyms.js'
import type { GameSettings } from '../game/tuning.js'
import type { Job } from '../game/levels.js'

/** The hints the game shows once per member (R-GAME-18). */
export const gameHints = ['firstDay', 'cooler', 'meeting', 'rebelMode'] as const

export type GameHint = (typeof gameHints)[number]

/** A player as stored with their account (R-GAME-16). */
export interface Player extends Progress {
  pseudonym: string
  shared: boolean
  hintsSeen: readonly string[]
}

/** Where a player's best stands on the leaderboard (R-GAME-13). */
export interface Place {
  position: number
  of: number
}

/** A best on the board, as the store reads it: who it is stays a flag. */
export interface BoardEntry {
  place: number
  /** The member's profile name where they share it, else the pseudonym. */
  name: string
  level: number
  mine: boolean
}

/** One row of the leaderboard as players see it (R-GAME-13). */
export interface BoardRow {
  place: number
  name: string
  job: Job
  level: number
  mine: boolean
}

export interface Leaderboard {
  rows: BoardRow[]
  /** The caller's own row when it is not among `rows`. */
  own: BoardRow | null
  /** How many players are on the board. */
  of: number
}

export interface GameStore {
  player(memberId: string): Promise<Player | null>
  /** The pseudonyms in use. */
  pseudonyms(): Promise<ReadonlySet<string>>
  /** Creates the player; false when the pseudonym was taken meanwhile. */
  create(memberId: string, pseudonym: string): Promise<boolean>
  /** Logs the day and saves the progress after it, together. */
  recordDay(
    day: DayRecord & { id: string; memberId: string },
    progress: Progress,
  ): Promise<void>
  share(memberId: string, shared: boolean): Promise<void>
  /** Adds the hint to those seen, once. */
  seeHint(memberId: string, hint: GameHint): Promise<void>
  /** The player's place among active members with a win, or null without
   * one. */
  place(memberId: string): Promise<Place | null>
  /** The best `size` entries and the caller's own, among active members with
   * a win, and how many there are. */
  board(
    memberId: string,
    size: number,
  ): Promise<{ entries: BoardEntry[]; of: number }>
}

/** The game's tuning as a player receives it: everything but the switch. */
export type Tuning = Omit<GameSettings, 'enabled'>

/** What the game starts a day from (R-GAME-16, R-GAME-17). */
export interface GameState {
  pseudonym: string
  shared: boolean
  /** The level to play next: the first day of the current job. */
  resumeLevel: number
  highestLevel: number
  best: { level: number; seconds: number } | null
  /** The first day of each job the player may play from. */
  playFrom: number[]
  hintsSeen: readonly string[]
  tuning: Tuning
}

export interface DayResult {
  state: GameState
  newBest: boolean
  place: Place | null
}

export interface GameService {
  /** The player's state; the first call creates the player. */
  state(memberId: string): Promise<GameState>
  /** Records a finished day, or 'implausible' for one that cannot have been
   * played (R-GAME-14, R-GAME-20). */
  recordDay(
    memberId: string,
    day: DayRecord,
  ): Promise<DayResult | 'implausible'>
  share(memberId: string, shared: boolean): Promise<void>
  seeHint(memberId: string, hint: GameHint): Promise<void>
  /** The leaderboard: the top `size`, and the caller's row below them. */
  leaderboard(memberId: string, size: number): Promise<Leaderboard>
}

const rowOf = (entry: BoardEntry): BoardRow => ({
  ...entry,
  job: jobOf(entry.level),
})

async function leaderboardOf(
  store: GameStore,
  memberId: string,
  size: number,
): Promise<Leaderboard> {
  const { entries, of } = await store.board(memberId, size)
  const rows = entries.slice(0, size).map(rowOf)
  const own = entries.slice(size).find((entry) => entry.mine)
  return { rows, own: own === undefined ? null : rowOf(own), of }
}

function tuningOf(settings: GameSettings): Tuning {
  const { enabled: _enabled, ...tuning } = settings
  return tuning
}

function stateOf(player: Player, settings: GameSettings): GameState {
  return {
    pseudonym: player.pseudonym,
    shared: player.shared,
    resumeLevel: firstDayOf(player.currentLevel),
    highestLevel: player.highestLevel,
    best:
      player.bestLevel === null || player.bestSeconds === null
        ? null
        : { level: player.bestLevel, seconds: player.bestSeconds },
    playFrom: firstDaysUpTo(player.highestLevel),
    hintsSeen: player.hintsSeen,
    tuning: tuningOf(settings),
  }
}

// Two first games at once can pick the same free pseudonym; the loser of the
// race picks again.
const CREATE_ATTEMPTS = 3

/** How long past its length a day's record may run, since a paused day's clock
 * stands still while the tab still counts (R-GAME-20). */
export interface DayAllowance {
  factor: number
  extraSeconds: number
}

export function createGame(deps: {
  store: GameStore
  settings: () => GameSettings
  allowance: DayAllowance
  newId: () => string
  random?: () => number
}): GameService {
  const random = deps.random ?? Math.random

  const playerOf = async (memberId: string): Promise<Player> => {
    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
      const existing = await deps.store.player(memberId)
      if (existing !== null) return existing
      const pseudonym = pickPseudonym(await deps.store.pseudonyms(), random)
      if (await deps.store.create(memberId, pseudonym))
        return { ...newProgress, pseudonym, shared: false, hintsSeen: [] }
    }
    throw new Error('no free pseudonym after several attempts')
  }

  return {
    state: async (memberId) =>
      stateOf(await playerOf(memberId), deps.settings()),
    recordDay: async (memberId, day) => {
      const settings = deps.settings()
      const player = await playerOf(memberId)
      const longest =
        deps.allowance.factor * settings.dayLengthSeconds +
        deps.allowance.extraSeconds
      if (!plausible(player, day, longest)) return 'implausible'
      const progress = progressAfter(player, day)
      await deps.store.recordDay(
        { ...day, id: deps.newId(), memberId },
        progress,
      )
      return {
        state: stateOf({ ...player, ...progress }, settings),
        newBest: progress.bestLevel !== player.bestLevel,
        place: await deps.store.place(memberId),
      }
    },
    share: async (memberId, shared) => {
      await playerOf(memberId)
      await deps.store.share(memberId, shared)
    },
    seeHint: async (memberId, hint) => {
      await playerOf(memberId)
      await deps.store.seeHint(memberId, hint)
    },
    leaderboard: (memberId, size) => leaderboardOf(deps.store, memberId, size),
  }
}
