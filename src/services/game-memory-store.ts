import type { DayRecord } from '../game/levels.js'
import type { GameStore, Place, Player } from './game.js'

/** A day as the memory store logged it. */
export type LoggedDay = DayRecord & { id: string; memberId: string }

type Players = Map<string, Player>

const fresh = (pseudonym: string): Player => ({
  pseudonym,
  shared: false,
  currentLevel: 1,
  highestLevel: 1,
  bestLevel: null,
  bestSeconds: null,
  totalSeconds: 0,
  hintsSeen: [],
})

function onBoard(player: Player): player is Player & {
  bestLevel: number
  bestSeconds: number
} {
  return player.bestLevel !== null && player.bestSeconds !== null
}

function placeIn(players: Players, memberId: string): Place | null {
  const own = players.get(memberId)
  if (own === undefined || !onBoard(own)) return null
  const board = [...players.values()].filter(onBoard)
  const ahead = board.filter(
    (player) =>
      player.bestLevel > own.bestLevel ||
      (player.bestLevel === own.bestLevel &&
        player.bestSeconds < own.bestSeconds),
  )
  return { position: ahead.length + 1, of: board.length }
}

function update(
  players: Players,
  memberId: string,
  change: (player: Player) => Player,
): Promise<void> {
  const player = players.get(memberId)
  if (player !== undefined) players.set(memberId, change(player))
  return Promise.resolve()
}

function create(
  players: Players,
  memberId: string,
  pseudonym: string,
): Promise<boolean> {
  const taken = [...players.values()].some(
    (player) => player.pseudonym === pseudonym,
  )
  if (taken || players.has(memberId)) return Promise.resolve(false)
  players.set(memberId, fresh(pseudonym))
  return Promise.resolve(true)
}

/** A game store in memory, for tests that need no database. Every member it
 * holds counts as active. */
export function createMemoryGameStore(): GameStore & {
  players: Players
  days: LoggedDay[]
} {
  const players: Players = new Map()
  const days: LoggedDay[] = []
  return {
    players,
    days,
    player: (memberId) => Promise.resolve(players.get(memberId) ?? null),
    pseudonyms: () =>
      Promise.resolve(new Set([...players.values()].map((p) => p.pseudonym))),
    create: (memberId, pseudonym) => create(players, memberId, pseudonym),
    recordDay: (day, progress) => {
      days.push(day)
      return update(players, day.memberId, (p) => ({ ...p, ...progress }))
    },
    share: (memberId, shared) =>
      update(players, memberId, (p) => ({ ...p, shared })),
    seeHint: (memberId, hint) =>
      update(players, memberId, (p) =>
        p.hintsSeen.includes(hint)
          ? p
          : { ...p, hintsSeen: [...p.hintsSeen, hint] },
      ),
    place: (memberId) => Promise.resolve(placeIn(players, memberId)),
  }
}
