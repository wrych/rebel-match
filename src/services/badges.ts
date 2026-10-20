import {
  badgeRows,
  eventRow,
  levelsReached,
  promotionLevels,
  rowNames,
  type BadgeRow,
  type SeenRow,
} from '../badges/rows.js'
import { crownAfter, type Standing } from '../badges/crowns.js'
import type { ChallengeService } from './challenges.js'
import type { EarnedEventBadge, EventBadgeStore } from './event-badge-store.js'
import type { GameService } from './game.js'
import type { ConnectionService } from './connections.js'
import type { SwipeService } from './swipes.js'

/** A level a member holds, as stored. */
export interface EarnedLevel {
  row: BadgeRow
  level: number
  earnedAt: Date
  seenAt: Date | null
}

export interface BadgeStore {
  /** The member's count for a row, from the records it counts (R-BADGE-1). */
  count(memberId: string, row: BadgeRow): Promise<number>
  /** Each active member's count for a row and when it reached it, leaving
   * out those at zero. */
  standings(row: BadgeRow): Promise<Standing[]>
  /** The crowns given so far, one per row ever checked. */
  crowns(): Promise<Crown[]>
  /** Gives a row's crown, or takes it from everyone with null; a crown not
   * seen is news, notified to its holder in the same transaction
   * (R-BADGE-10, R-NOTE-10). */
  setCrown(row: BadgeRow, memberId: string | null, seen: boolean): Promise<void>
  /** Records the levels not yet held; seen ones are not new, the rest are
   * notified in the same transaction (R-NOTE-10). Returns those it added. */
  award(
    memberId: string,
    row: BadgeRow,
    levels: readonly number[],
    seen: boolean,
  ): Promise<number[]>
  earned(memberId: string): Promise<EarnedLevel[]>
  launched(): Promise<boolean>
  markLaunched(): Promise<void>
  /** How many of the member's levels and crowns are new. */
  newCount(memberId: string): Promise<number>
  /** Marks the member's levels and crown in these rows as seen. */
  markSeen(memberId: string, rows: readonly BadgeRow[]): Promise<void>
}

/** A row's crown as stored: its holder, if anyone. */
export interface Crown {
  row: BadgeRow
  memberId: string | null
  seenAt: Date | null
}

/** One level of a row as the member sees it. */
export interface LevelView {
  level: number
  name: string
  /** The count it is earned at. */
  needs: number
  earnedAt: string | null
  new: boolean
}

export interface RowView {
  row: BadgeRow
  title: string
  /** What the row counts, singular and plural. */
  counts: readonly [string, string]
  explains: string
  count: number
  levels: LevelView[]
  /** Whether the member holds it, and nothing about who else might
   * (R-BADGE-8). */
  crown: { name: string; held: boolean; new: boolean }
}

export interface BadgeOverview {
  rows: RowView[]
  /** Newest first (R-BADGE-7). */
  events: EarnedEventBadge[]
}

export interface BadgeService {
  /** Counts the rows again for one member and records any level reached. */
  recount(memberId: string, rows: readonly BadgeRow[]): Promise<void>
  /** The member's own badges, never anyone else's (R-BADGE-12). */
  mine(memberId: string): Promise<BadgeOverview>
  /** Records, once and quietly, what was earned before badges existed
   * (R-BADGE-11). */
  awardAtLaunch(): Promise<void>
  /** Moves each crown to whoever leads now, for counts that fell with nobody
   * acting (R-BADGE-3). */
  checkCrowns(): Promise<void>
  /** How many of the member's badges are new, for the menu (R-BADGE-10). */
  newCount(memberId: string): Promise<number>
  /** The member opened these rows' badges, so none of them is new any more
   * (R-BADGE-10). */
  seen(memberId: string, rows: readonly SeenRow[]): Promise<void>
  /** Earns an invite's event badge for a member already in (R-BADGE-6). */
  claim(memberId: string, token: string): Promise<void>
}

function rowView(
  row: BadgeRow,
  count: number,
  held: readonly EarnedLevel[],
  levelCounts: readonly number[],
  crown: Crown | undefined,
  memberId: string,
): RowView {
  const names = rowNames[row]
  const holds = crown?.memberId === memberId
  return {
    row,
    title: names.title,
    counts: names.counts,
    explains: names.explains,
    count,
    levels: levelCounts.map((needs, index) => {
      const earned = held.find((each) => each.level === index + 1)
      return {
        level: index + 1,
        name: names.levels[index] ?? '',
        needs,
        earnedAt: earned?.earnedAt.toISOString() ?? null,
        new: earned !== undefined && earned.seenAt === null,
      }
    }),
    crown: { name: names.crown, held: holds, new: holds && !crown.seenAt },
  }
}

// Where each row's levels sit, and which rows are shown now: the game's
// promotions only while the game is on (R-BADGE-9).
interface Rules {
  countsOf(row: BadgeRow): readonly number[]
  shown(): BadgeRow[]
}

function rulesOf(deps: {
  levelCounts: () => readonly number[]
  gameOn: () => boolean
}): Rules {
  return {
    countsOf: (row) => (row === 'game' ? promotionLevels : deps.levelCounts()),
    shown: () => badgeRows.filter((row) => row !== 'game' || deps.gameOn()),
  }
}

// A row's first crown is given quietly, as everything from before launch is
// (R-BADGE-11); a crown moving after that is news to the gainer only.
async function checkCrown(
  store: BadgeStore,
  rules: Rules,
  row: BadgeRow,
): Promise<void> {
  const current = (await store.crowns()).find((crown) => crown.row === row)
  const holder = current?.memberId ?? null
  const next = crownAfter(
    holder,
    await store.standings(row),
    rules.countsOf(row)[0] ?? 1,
  )
  if (current === undefined) await store.setCrown(row, next, true)
  else if (next !== holder) await store.setCrown(row, next, false)
}

async function awardAtLaunch(store: BadgeStore, rules: Rules): Promise<void> {
  if (await store.launched()) return
  for (const row of badgeRows) {
    for (const { memberId, count } of await store.standings(row)) {
      const reached = levelsReached(count, rules.countsOf(row))
      if (reached.length > 0) await store.award(memberId, row, reached, true)
    }
  }
  await store.markLaunched()
}

async function seen(
  deps: { store: BadgeStore; events: EventBadgeStore },
  memberId: string,
  rows: readonly SeenRow[],
): Promise<void> {
  await deps.store.markSeen(
    memberId,
    rows.filter((row): row is BadgeRow => row !== eventRow),
  )
  if (rows.includes(eventRow)) await deps.events.markSeen(memberId)
}

/** Badge levels counted from what members already do and kept once earned
 * (R-BADGE-1, R-BADGE-2, ADR 0053). */
export function createBadges(deps: {
  store: BadgeStore
  events: EventBadgeStore
  levelCounts: () => readonly number[]
  gameOn: () => boolean
}): BadgeService {
  const { store } = deps
  const rules = rulesOf(deps)
  return {
    recount: async (memberId, rows) => {
      for (const row of rows) {
        const count = await store.count(memberId, row)
        const reached = levelsReached(count, rules.countsOf(row))
        if (reached.length > 0) await store.award(memberId, row, reached, false)
        await checkCrown(store, rules, row)
      }
    },
    mine: async (memberId) => {
      const [earned, crowns] = await Promise.all([
        store.earned(memberId),
        store.crowns(),
      ])
      const rows = await Promise.all(
        rules.shown().map(async (row) =>
          rowView(
            row,
            await store.count(memberId, row),
            earned.filter((each) => each.row === row),
            rules.countsOf(row),
            crowns.find((crown) => crown.row === row),
            memberId,
          ),
        ),
      )
      return { rows, events: await deps.events.mine(memberId) }
    },
    awardAtLaunch: () => awardAtLaunch(store, rules),
    newCount: async (memberId) =>
      (await store.newCount(memberId)) + (await deps.events.newCount(memberId)),
    seen: (memberId, rows) => seen(deps, memberId, rows),
    claim: (memberId, token) => deps.events.claim(memberId, token, new Date()),
    checkCrowns: async () => {
      for (const row of rules.shown()) await checkCrown(store, rules, row)
    },
  }
}

type Recount = (memberId: string, rows: readonly BadgeRow[]) => Promise<void>

// The act has happened whatever becomes of its count: a failure is reported,
// and the member's next counted act catches up on the level.
function recountAfter(
  badges: Pick<BadgeService, 'recount'>,
  onError: (error: unknown) => void,
): Recount {
  return (memberId, rows) => badges.recount(memberId, rows).catch(onError)
}

/** Challenges, counting the author's posted ones when a trend is confirmed,
 * which is when a challenge is posted (R-BADGE-1, R-ASK-9). */
export function countingChallenges(
  challenges: ChallengeService,
  badges: Pick<BadgeService, 'recount'>,
  onError: (error: unknown) => void,
): ChallengeService {
  const recount = recountAfter(badges, onError)
  return {
    ...challenges,
    confirmTrend: async (memberId, id, trendId) => {
      const outcome = await challenges.confirmTrend(memberId, id, trendId)
      if (outcome === 'saved') await recount(memberId, ['speak'])
      return outcome
    },
  }
}

/** Connections, counting a same-boat request for its requester and an
 * accepted connection for both members (R-BADGE-1). */
export function countingConnections(
  connections: ConnectionService,
  badges: Pick<BadgeService, 'recount'>,
  onError: (error: unknown) => void,
): ConnectionService {
  const recount = recountAfter(badges, onError)
  return {
    ...connections,
    request: async (requesterId, input) => {
      const outcome = await connections.request(requesterId, input)
      if (outcome.result === 'not_found') return outcome
      if (input.kind === 'same_boat') await recount(requesterId, ['boat'])
      if (outcome.result === 'joined') {
        await recount(requesterId, ['connect'])
        await recount(input.targetId, ['connect'])
      }
      return outcome
    },
    respond: async (memberId, id, answer) => {
      const outcome = await connections.respond(memberId, id, answer)
      if (outcome === 'done' && answer === 'accepted') {
        const view = await connections.get(memberId, id)
        await recount(memberId, ['connect'])
        if (view !== null) await recount(view.other.memberId, ['connect'])
      }
      return outcome
    },
  }
}

/** The deck, counting a "been there" offer for the member who sent it; an
 * ask from the matches screen is not one (R-BADGE-1). */
export function countingSwipes(
  swipes: SwipeService,
  badges: Pick<BadgeService, 'recount'>,
  onError: (error: unknown) => void,
): SwipeService {
  const recount = recountAfter(badges, onError)
  return {
    swipe: async (memberId, input) => {
      const outcome = await swipes.swipe(memberId, input)
      if (outcome.result === 'recorded' && input.action === 'been_there')
        await recount(memberId, ['help'])
      return outcome
    },
  }
}

/** The game, counting the player's promotions whenever their progress may
 * have moved: their first visit, which makes them a Team Lead, and every
 * day recorded (R-BADGE-1, R-GAME-16). */
export function countingGame(
  game: GameService,
  badges: Pick<BadgeService, 'recount'>,
  onError: (error: unknown) => void,
): GameService {
  const recount = recountAfter(badges, onError)
  return {
    ...game,
    state: async (memberId) => {
      const state = await game.state(memberId)
      await recount(memberId, ['game'])
      return state
    },
    recordDay: async (memberId, day) => {
      const result = await game.recordDay(memberId, day)
      if (result !== 'implausible') await recount(memberId, ['game'])
      return result
    },
  }
}
