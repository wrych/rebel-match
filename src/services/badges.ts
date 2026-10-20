import {
  countedRows,
  levelsReached,
  rowNames,
  type CountedRow,
} from '../badges/rows.js'
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
  /** Each active member's count for a row, leaving out those at zero. */
  everyCount(row: CountedRow): Promise<{ memberId: string; count: number }[]>
  /** Records the levels not yet held; seen ones are not new. Returns the
   * levels it added. */
  award(
    memberId: string,
    row: CountedRow,
    levels: readonly number[],
    seen: boolean,
  ): Promise<number[]>
  earned(memberId: string): Promise<EarnedLevel[]>
  launched(): Promise<boolean>
  markLaunched(): Promise<void>
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
  count: number
  levels: LevelView[]
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
}

function rowView(
  row: CountedRow,
  count: number,
  held: readonly EarnedLevel[],
  levelCounts: readonly number[],
): RowView {
  const names = rowNames[row]
  return {
    row,
    title: names.title,
    counts: names.counts,
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
  }
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
      }
    },
    mine: async (memberId) => {
      const earned = await store.earned(memberId)
      const rows = await Promise.all(
        countedRows.map(async (row) =>
          rowView(
            row,
            await store.count(memberId, row),
            earned.filter((each) => each.row === row),
            deps.levelCounts(),
          ),
        ),
      )
      return { rows }
    },
    awardAtLaunch: async () => {
      if (await store.launched()) return
      for (const row of countedRows) {
        for (const { memberId, count } of await store.everyCount(row)) {
          const reached = levelsReached(count, deps.levelCounts())
          if (reached.length > 0)
            await store.award(memberId, row, reached, true)
        }
      }
      await store.markLaunched()
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
