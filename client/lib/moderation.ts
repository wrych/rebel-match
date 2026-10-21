import type {
  ModeratedChallenge,
  ModerationReason,
} from '../../src/services/challenge-moderation'
import type {
  ModerationAction,
  ModerationItem,
  ModerationPage,
  ReportedMember,
} from '../../src/services/moderation'
import type { ReportItem } from '../../src/services/reports'
import { findJson, getJson, outcomeOf, send } from './request'

export type {
  ModeratedChallenge,
  ModerationAction,
  ModerationItem,
  ModerationPage,
  ModerationReason,
  ReportedMember,
}

const reasonWords: Record<ModerationReason, string> = {
  spam: 'as spam',
  inappropriate: 'as inappropriate',
  other: 'for another reason',
}

/** How a hiding's reason reads after "hid it" (R-MOD-8). */
export function hiddenAs(reason: ModerationReason): string {
  return reasonWords[reason]
}

/** The member's challenges as a host sees them (R-MOD-8, R-MEM-2); null when
 * there is no such member. */
export async function fetchMemberChallenges(
  memberId: string,
): Promise<ModeratedChallenge[] | null> {
  const found = await findJson<{ challenges: ModeratedChallenge[] }>(
    `/api/admin/members/${encodeURIComponent(memberId)}/challenges`,
    'challenges unavailable',
  )
  return found?.challenges ?? null
}

/** Hides a challenge from everyone but its author (R-MOD-8); `gone` when it
 * is already hidden or no longer there. */
export async function hideChallenge(
  id: string,
  reason: ModerationReason,
): Promise<'done' | 'gone'> {
  const response = await send(
    `/api/admin/challenges/${encodeURIComponent(id)}/hide`,
    'POST',
    { reason },
  )
  return outcomeOf<'done' | 'gone'>(response, 'challenge not hidden', {
    204: 'done',
    404: 'gone',
  })
}

/** Shows a hidden challenge again (R-MOD-8); `gone` when it is not hidden. */
export async function unhideChallenge(id: string): Promise<'done' | 'gone'> {
  const response = await send(
    `/api/admin/challenges/${encodeURIComponent(id)}/unhide`,
    'POST',
  )
  return outcomeOf<'done' | 'gone'>(response, 'challenge not shown', {
    204: 'done',
    404: 'gone',
  })
}

/** The members others reported, open or handled (R-MOD-6). */
export async function fetchReportedMembers(
  state: 'open' | 'handled',
): Promise<ReportedMember[]> {
  const { members } = await getJson<{ members: ReportedMember[] }>(
    `/api/admin/reports?state=${state}`,
    'reported members unavailable',
  )
  return members
}

/** One reported member's items, reports and history (R-MOD-7); null when
 * there is no such member. */
export function fetchModerationPage(
  memberId: string,
): Promise<ModerationPage | null> {
  return findJson<ModerationPage>(
    `/api/admin/reports/${encodeURIComponent(memberId)}`,
    'moderation page unavailable',
  )
}

/** Marks an item's open reports handled without acting on it (R-MOD-7);
 * `gone` when none were open. */
export async function dismissReports(
  item: ReportItem,
): Promise<'done' | 'gone'> {
  const response = await send('/api/admin/reports/dismiss', 'POST', item)
  return outcomeOf<'done' | 'gone'>(response, 'reports not dismissed', {
    204: 'done',
    404: 'gone',
  })
}

/** How many members have open reports (R-MOD-5); 0 when it cannot be
 * read, as the menu shows no count then. */
export async function fetchOpenReported(): Promise<number> {
  const response = await send('/api/admin/reports/count')
  if (!response.ok) return 0
  const { members } = (await response.json()) as { members?: unknown }
  return typeof members === 'number' && Number.isInteger(members) && members > 0
    ? members
    : 0
}

/** The menu's Moderation entry: the count only while any is open
 * (R-MOD-5). */
export function moderationLabel(count: number): string {
  return count > 0 ? `Moderation (${String(count)})` : 'Moderation'
}

/** Where a reported member's moderation page is (design S40). */
export const moderationPath = (memberId: string): string =>
  `/admin/moderation/${encodeURIComponent(memberId)}`

const reasonLabels: Record<ModerationReason, string> = {
  spam: 'Spam',
  inappropriate: 'Inappropriate',
  other: 'Something else',
}

/** A reason as hosts read it in lists (R-MOD-6). */
export const reasonLabel = (reason: ModerationReason): string =>
  reasonLabels[reason]

/** Hides a request's note from everyone but its sender (R-MOD-8); `gone`
 * when it is already hidden or has no note. */
export async function hideNote(
  requestId: string,
  reason: ModerationReason,
): Promise<'done' | 'gone'> {
  const response = await send(
    `/api/admin/requests/${encodeURIComponent(requestId)}/hide-note`,
    'POST',
    { reason },
  )
  return outcomeOf<'done' | 'gone'>(response, 'note not hidden', {
    204: 'done',
    404: 'gone',
  })
}

/** Shows a hidden note again (R-MOD-8); `gone` when it is not hidden. */
export async function unhideNote(requestId: string): Promise<'done' | 'gone'> {
  const response = await send(
    `/api/admin/requests/${encodeURIComponent(requestId)}/unhide-note`,
    'POST',
  )
  return outcomeOf<'done' | 'gone'>(response, 'note not shown', {
    204: 'done',
    404: 'gone',
  })
}
