import { apiPaths, fill } from '../../src/api-paths'
import {
  banStatus,
  dismissStatus,
  hideStatus,
  unbanStatus,
  unhideStatus,
} from '../../src/outcomes'
import type {
  ModeratedChallenge,
  ModerationReason,
} from '../../src/services/challenge-moderation'
import type {
  ModeratedItem,
  ModerationAction,
  ModerationItem,
  ModerationPage,
  ReportedMember,
} from '../../src/services/moderation'
import { findJson, getJson, outcomeFrom, send } from './request'
import { pathTo } from '../../src/routes'

export type {
  ModeratedChallenge,
  ModeratedItem,
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
    fill(apiPaths.memberChallenges, { id: memberId }),
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
  const response = await send(fill(apiPaths.hideChallenge, { id }), 'POST', {
    reason,
  })
  return outcomeFrom(response, 'challenge not hidden', hideStatus, {
    hidden: 'done',
    not_found: 'gone',
  })
}

/** Shows a hidden challenge again (R-MOD-8); `gone` when it is not hidden. */
export async function unhideChallenge(id: string): Promise<'done' | 'gone'> {
  const response = await send(fill(apiPaths.unhideChallenge, { id }), 'POST')
  return outcomeFrom(response, 'challenge not shown', unhideStatus, {
    shown: 'done',
    not_found: 'gone',
  })
}

/** Bans a member, with the reason hosts keep (R-MOD-9); `gone` when they are
 * not active, `refused` for oneself or the last who can grant roles. */
export async function banMember(
  memberId: string,
  note: string,
): Promise<'done' | 'gone' | 'refused'> {
  const response = await send(
    fill(apiPaths.banMember, { id: memberId }),
    'POST',
    { note },
  )
  return outcomeFrom(response, 'member not banned', banStatus, {
    banned: 'done',
    not_found: 'gone',
    self: 'refused',
    last_admin: 'refused',
  })
}

/** Lifts a ban (R-MOD-9); `gone` when the member is not banned. */
export async function unbanMember(memberId: string): Promise<'done' | 'gone'> {
  const response = await send(
    fill(apiPaths.unbanMember, { id: memberId }),
    'POST',
  )
  return outcomeFrom(response, 'ban not lifted', unbanStatus, {
    unbanned: 'done',
    not_found: 'gone',
  })
}

/** The members others reported, open or handled (R-MOD-6). */
export async function fetchReportedMembers(
  state: 'open' | 'handled',
): Promise<ReportedMember[]> {
  const { members } = await getJson<{ members: ReportedMember[] }>(
    `${apiPaths.moderationReports}?state=${state}`,
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
    fill(apiPaths.memberReports, { memberId }),
    'moderation page unavailable',
  )
}

/** Marks an item's open reports handled without acting on it (R-MOD-7);
 * `gone` when none were open. */
export async function dismissReports(
  item: ModeratedItem,
): Promise<'done' | 'gone'> {
  const response = await send(apiPaths.dismissReport, 'POST', item)
  return outcomeFrom(response, 'reports not dismissed', dismissStatus, {
    dismissed: 'done',
    not_found: 'gone',
  })
}

/** How many members have open reports (R-MOD-5); 0 when it cannot be
 * read, as the menu shows no count then. */
export async function fetchOpenReported(): Promise<number> {
  const response = await send(apiPaths.reportCount)
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
  pathTo('admin-moderated-member', { memberId })

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
    fill(apiPaths.hideRequestNote, { id: requestId }),
    'POST',
    { reason },
  )
  return outcomeFrom(response, 'note not hidden', hideStatus, {
    hidden: 'done',
    not_found: 'gone',
  })
}

/** Shows a hidden note again (R-MOD-8); `gone` when it is not hidden. */
export async function unhideNote(requestId: string): Promise<'done' | 'gone'> {
  const response = await send(
    fill(apiPaths.unhideRequestNote, { id: requestId }),
    'POST',
  )
  return outcomeFrom(response, 'note not shown', unhideStatus, {
    shown: 'done',
    not_found: 'gone',
  })
}
