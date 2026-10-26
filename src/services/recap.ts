import { countedRows, type CountedRow } from '../badges/rows.js'
import type { Standing } from '../badges/crowns.js'
import type { NetworkTimeline } from '../network/timeline.js'
import { shareBelow } from '../recap/compare.js'
import type { BadgeService, RowView } from './badges.js'
import type { EarnedEventBadge } from './event-badge-store.js'
import type { NetworkService } from './network.js'

/** One counted row of the recap: the member's count, the highest level they
 * earned, their crown, and the share of active members below them. */
export interface RecapRow {
  row: CountedRow
  count: number
  level: string | null
  /** How many of the row's levels the member reached, of how many. */
  reached: number
  levels: number
  crown: { name: string; held: boolean }
  below: number | null
}

/** The member's own recap (R-RECAP-2, R-RECAP-4): the day they joined, how
 * many are in the network, their rows and event badges, and the replay with
 * them marked. */
/** An event badge the member earned, as its ticket shows it (R-BADGE-6). */
export type RecapEvent = Pick<
  EarnedEventBadge,
  'id' | 'name' | 'ticketLine' | 'bigLine' | 'hasLogo'
>

export interface Recap {
  joined: string | null
  members: number
  rows: RecapRow[]
  events: RecapEvent[]
  timeline: NetworkTimeline
}

export interface RecapService {
  /** The caller's recap, and nobody else's (R-RECAP-4). */
  mine(memberId: string): Promise<Recap>
}

const isCounted = (row: string): row is CountedRow =>
  (countedRows as readonly string[]).includes(row)

const highestLevel = (view: RowView): string | null =>
  view.levels.filter((level) => level.earnedAt !== null).at(-1)?.name ?? null

/** The summit recap, from the badges' own counts and the replay's timeline:
 * each count is compared only as a rounded share of everyone, so no other
 * member is named or counted singly (R-RECAP-3, ADR 0059). */
export function createRecap(deps: {
  badges: Pick<BadgeService, 'mine'>
  standings: (row: CountedRow) => Promise<Standing[]>
  network: Pick<NetworkService, 'timeline'>
  rule: () => { step: number; minMembers: number; minShare: number }
}): RecapService {
  async function rowOf(view: RowView, members: number): Promise<RecapRow[]> {
    if (!isCounted(view.row)) return []
    const counts = (await deps.standings(view.row)).map((each) => each.count)
    return [
      {
        row: view.row,
        count: view.count,
        level: highestLevel(view),
        reached: view.levels.filter((level) => level.earnedAt !== null).length,
        levels: view.levels.length,
        crown: { name: view.crown.name, held: view.crown.held },
        below: shareBelow(view.count, counts, members, deps.rule()),
      },
    ]
  }

  return {
    mine: async (memberId) => {
      const [overview, timeline] = await Promise.all([
        deps.badges.mine(memberId),
        deps.network.timeline(memberId),
      ])
      const members = timeline.nodes.length
      const rows = await Promise.all(
        overview.rows.map((view) => rowOf(view, members)),
      )
      return {
        joined: timeline.nodes.find((node) => node.self)?.day ?? null,
        members,
        rows: rows.flat(),
        events: overview.events.map(
          ({ id, name, ticketLine, bigLine, hasLogo }) => ({
            id,
            name,
            ticketLine,
            bigLine,
            hasLogo,
          }),
        ),
        timeline,
      }
    },
  }
}
