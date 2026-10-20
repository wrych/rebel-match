import {
  countedRows,
  levelsReached,
  rowNames,
  type CountedRow,
} from '../badges/rows.js'
import { crownAfter, type Standing } from '../badges/crowns.js'
import type { ChallengeService } from './challenges.js'
import type { ConnectionService } from './connections.js'
import type { SwipeService } from './swipes.js'

/** A level a member holds, as stored. */
export interface EarnedLevel {
  row: CountedRow
  level: number
  earnedAt: Date
  seenAt: Date | null
}

export interface BadgeStore {
  /** The member's count for a row, from the records it counts (R-BADGE-1). */
  count(memberId: string, row: CountedRow): Promise<number>
  /** Each active member's count for a row and when it reached it, leaving
   * out those at zero. */
  standings(row: CountedRow): Promise<Standing[]>
  /** The crowns given so far, one per row ever checked. */
  crowns(): Promise<Crown[]>
  /** Gives a row's crown, or takes it from everyone with null; a crown not
   * seen is news, notified to its holder in the same transaction
   * (R-BADGE-10, R-NOTE-10). */
  setCrown(
    row: CountedRow,
    memberId: string | null,
    seen: boolean,
  ): Promise<void>
  /** Records the levels not yet held; seen ones are not new, the rest are
   * notified in the same transaction (R-NOTE-10). Returns those it added. */
  award(
    memberId: string,
    row: CountedRow,
    levels: readonly number[],
    seen: boolean,
  ): Promise<number[]>
  earned(memberId: string): Promise<EarnedLevel[]>
  launched(): Promise<boolean>
  markLaunched(): Promise<void>
  /** How many of the member's levels and crowns are new. */
  newCount(memberId: string): Promise<number>
  /** Marks the member's levels and crown in these rows as seen. */
  markSeen(memberId: string, rows: readonly CountedRow[]): Promise<void>
}

/** A row's crown as stored: its holder, if anyone. */
export interface Crown {
  row: CountedRow
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
  row: CountedRow
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
}

export interface BadgeService {
  /** Counts the rows again for one member and records any level reached. */
  recount(memberId: string, rows: readonly CountedRow[]): Promise<void>
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
  seen(memberId: string, rows: readonly CountedRow[]): Promise<void>
}

function rowView(
  row: CountedRow,
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

// A row's first crown is given quietly, as everything from before launch is
// (R-BADGE-11); a crown moving after that is news to the gainer only.
async function checkCrown(
  store: BadgeStore,
  levelCounts: () => readonly number[],
  row: CountedRow,
): Promise<void> {
  const current = (await store.crowns()).find((crown) => crown.row === row)
  const holder = current?.memberId ?? null
  const next = crownAfter(
    holder,
    await store.standings(row),
    levelCounts()[0] ?? 1,
  )
  if (current === undefined) await store.setCrown(row, next, true)
  else if (next !== holder) await store.setCrown(row, next, false)
}

async function awardAtLaunch(
  store: BadgeStore,
  levelCounts: () => readonly number[],
): Promise<void> {
  if (await store.launched()) return
  for (const row of countedRows) {
    for (const { memberId, count } of await store.standings(row)) {
      const reached = levelsReached(count, levelCounts())
      if (reached.length > 0) await store.award(memberId, row, reached, true)
    }
  }
  await store.markLaunched()
}

/** Badge levels counted from what members already do and kept once earned
 * (R-BADGE-1, R-BADGE-2, ADR 0053). */
export function createBadges(deps: {
  store: BadgeStore
  levelCounts: () => readonly number[]
}): BadgeService {
  const { store } = deps
  return {
    recount: async (memberId, rows) => {
      for (const row of rows) {
        const count = await store.count(memberId, row)
        const reached = levelsReached(count, deps.levelCounts())
        if (reached.length > 0) await store.award(memberId, row, reached, false)
        await checkCrown(store, deps.levelCounts, row)
      }
    },
    mine: async (memberId) => {
      const [earned, crowns] = await Promise.all([
        store.earned(memberId),
        store.crowns(),
      ])
      const rows = await Promise.all(
        countedRows.map(async (row) =>
          rowView(
            row,
            await store.count(memberId, row),
            earned.filter((each) => each.row === row),
            deps.levelCounts(),
            crowns.find((crown) => crown.row === row),
            memberId,
          ),
        ),
      )
      return { rows }
    },
    awardAtLaunch: () => awardAtLaunch(store, deps.levelCounts),
    newCount: (memberId) => store.newCount(memberId),
    seen: (memberId, rows) => store.markSeen(memberId, rows),
    checkCrowns: async () => {
      for (const row of countedRows)
        await checkCrown(store, deps.levelCounts, row)
    },
  }
}

type Recount = (memberId: string, rows: readonly CountedRow[]) => Promise<void>

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
