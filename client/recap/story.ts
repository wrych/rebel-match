import { rowNames } from '../../src/badges/rows'
import type { Recap, RecapRow } from '../lib/recap'

/** One story of the recap (R-RECAP-2): the opening, the day the member
 * joined, each counted row above zero, the crowns they hold, the network
 * today with them lit, and the card to share. */
export type Beat =
  | { kind: 'intro' }
  | { kind: 'joined'; day: string; number: number; at: number }
  | {
      kind: 'row'
      row: RecapRow['row']
      title: string
      count: number
      counts: string
      level: string | null
      /** For the badges screen's marks: levels reached, of how many, and
       * whether the row's crown is held. */
      reached: number
      levels: number
      crowned: boolean
      compared: string | null
    }
  | { kind: 'crowns'; names: string[] }
  | { kind: 'network'; members: number }
  | { kind: 'card' }

/** How a share of members below reads: "Ahead of 80% of rebels" (R-RECAP-3). */
export const compared = (below: number | null): string | null =>
  below === null ? null : `Ahead of ${String(below)}% of rebels`

/** What a row counts, singular or plural by its count. */
export const countsOf = (row: RecapRow): string =>
  rowNames[row.row].counts[row.count === 1 ? 0 : 1]

function joinedOf(recap: Recap): Beat[] {
  const index = recap.timeline.nodes.findIndex((node) => node.self)
  const self = recap.timeline.nodes[index]
  if (recap.joined === null || self === undefined) return []
  return [{ kind: 'joined', day: recap.joined, number: index + 1, at: self.at }]
}

const rowBeat = (row: RecapRow): Beat => ({
  kind: 'row',
  row: row.row,
  title: rowNames[row.row].title,
  count: row.count,
  counts: countsOf(row),
  level: row.level,
  reached: row.reached,
  levels: row.levels,
  crowned: row.crown.held,
  compared: compared(row.below),
})

/** The member's recap as stories, a beat at zero left out rather than shown
 * as nothing (R-RECAP-2). */
export function storyOf(recap: Recap): Beat[] {
  const crowns = recap.rows
    .filter((row) => row.crown.held)
    .map((row) => row.crown.name)
  return [
    { kind: 'intro' },
    ...joinedOf(recap),
    ...recap.rows.filter((row) => row.count > 0).map(rowBeat),
    ...(crowns.length > 0 ? [{ kind: 'crowns' as const, names: crowns }] : []),
    ...(recap.members > 0
      ? [{ kind: 'network' as const, members: recap.members }]
      : []),
    { kind: 'card' },
  ]
}
