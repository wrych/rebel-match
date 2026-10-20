import type { SeenRow } from '../../src/badges/rows'
import type { BadgeOverview, RowView } from '../../src/services/badges'
import type { EarnedEventBadge } from '../../src/services/event-badge-store'

export type { BadgeOverview, EarnedEventBadge, RowView }

/** How a badge is drawn: locked, a level (the game's promotions have six),
 * or the crown. */
export type Tier = 'locked' | number | 'crown'

/** The member's own badges (R-BADGE-7). */
export async function fetchBadges(): Promise<BadgeOverview> {
  const response = await fetch('/api/badges')
  if (!response.ok)
    throw new Error(`badges unavailable (${String(response.status)})`)
  return (await response.json()) as BadgeOverview
}

/** Heard by the menu, so its count clears once a screen marked badges seen
 * (R-BADGE-10). */
export const BADGES_SEEN = 'badges-seen'

/** Records that the member saw these rows' badges, or with `event` their
 * event badges, so none is new any more (R-BADGE-10). */
export async function markBadgesSeen(rows: readonly SeenRow[]): Promise<void> {
  if (rows.length === 0) return
  const response = await fetch('/api/badges/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
  if (!response.ok)
    throw new Error(`badges not marked (${String(response.status)})`)
  window.dispatchEvent(new Event(BADGES_SEEN))
}

/** Asks for the event badge of an invite a signed-in member opened. The
 * server says nothing of the invite, so neither does this (R-BADGE-6,
 * R-INV-5). */
export function claimEventBadge(invite: string): void {
  fetch('/api/badges/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite }),
  }).catch(() => undefined)
}

/** How many badges are new, for the menu; a failed read counts as none. */
export async function fetchNewBadges(): Promise<number> {
  const response = await fetch('/api/badges/new')
  if (!response.ok) return 0
  const { count } = (await response.json()) as { count?: unknown }
  return typeof count === 'number' && Number.isInteger(count) && count > 0
    ? count
    : 0
}

/** The menu item's words (R-BADGE-10). */
export function badgesLabel(fresh: number): string {
  return fresh > 0 ? `Badges (${String(fresh)} new)` : 'Badges'
}

const levelsEarned = (row: RowView): number =>
  row.levels.filter((level) => level.earnedAt !== null).length

/** A row's best badge: the crown while held, else its highest level, else
 * its first level, locked. */
export function bestOf(row: RowView): { tier: Tier; name: string } {
  if (row.crown.held) return { tier: 'crown', name: row.crown.name }
  const earned = levelsEarned(row)
  const level = row.levels[Math.max(earned, 1) - 1]
  return {
    tier: earned === 0 ? 'locked' : earned,
    name: level?.name ?? '',
  }
}

/** Levels, crowns and event badges earned (R-BADGE-7). */
export function earnedCount(overview: BadgeOverview): number {
  return overview.rows.reduce(
    (sum, row) => sum + levelsEarned(row) + (row.crown.held ? 1 : 0),
    overview.events.length,
  )
}

/** Whether any event badge is new. */
export const hasNewEvent = (events: readonly EarnedEventBadge[]): boolean =>
  events.some((badge) => badge.new)

/** Whether any badge in the row is new. */
export const hasNew = (row: RowView): boolean =>
  row.crown.new || row.levels.some((level) => level.new)

/** The level a member works towards next, if any is left. */
export function nextLevel(row: RowView): RowView['levels'][number] | null {
  return row.levels.find((level) => level.earnedAt === null) ?? null
}
