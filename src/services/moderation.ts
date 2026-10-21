import type { ModerationReason } from './challenge-moderation.js'
import type { ReportItem } from './reports.js'

/** One reported member on the moderation screen (R-MOD-6). Open counts what
 * no host has handled yet; on the Handled tab, everything ever reported. */
export interface ReportedMember {
  memberId: string
  name: string | null
  email: string
  org: string | null
  status: 'applicant' | 'active' | 'rejected' | 'deleted' | 'banned'
  reports: number
  /** Different members who reported them; erased reporters not counted. */
  reporters: number
  challenges: number
  notes: number
  reasons: { reason: ModerationReason; count: number }[]
  latestAt: string
}

export interface ItemReport {
  reason: ModerationReason
  comment: string | null
  at: string
  /** Who reported it, for hosts only; null once they were erased (R-MOD-7,
   * R-MOD-11). */
  reporter: string | null
  open: boolean
}

/** One reported challenge or note with every report about it (R-MOD-7). A
 * withdrawn challenge shows no text, as its author took it back (R-ASK-17). */
export interface ModerationItem {
  kind: 'challenge' | 'note'
  id: string
  body: string | null
  trendShort: string | null
  /** For a note: the member it was sent to. */
  sentTo: string | null
  state: 'shown' | 'withdrawn' | 'hidden'
  hiddenReason: ModerationReason | null
  reports: ItemReport[]
}

export interface ModerationAction {
  kind: 'hide' | 'unhide' | 'dismiss' | 'ban' | 'unban'
  /** The host who acted; null once they were erased. */
  actor: string | null
  at: string
  item: 'challenge' | 'note' | null
  reason: ModerationReason | null
  note: string | null
}

export interface ModerationPage {
  member: {
    id: string
    name: string | null
    email: string
    org: string | null
    status: ReportedMember['status']
    joinedAt: string
  }
  /** Open reports, and how many different members made them; erased
   * reporters not counted (R-MOD-7). */
  open: { reports: number; reporters: number }
  /** Those with open reports first, then by how many reports. */
  items: ModerationItem[]
  /** Newest first. */
  history: ModerationAction[]
}

export interface ModerationStore {
  overview(state: 'open' | 'handled'): Promise<ReportedMember[]>
  /** How many members have open reports. */
  openMembers(): Promise<number>
  page(memberId: string): Promise<ModerationPage | null>
  /** Marks the item's open reports handled and records the host's dismissal,
   * in one transaction; false when it has none open. */
  dismiss(item: ReportItem, actorId: string): Promise<boolean>
  /** Hides a request's note not yet hidden, declines the request if it is
   * pending, handles the note's reports and records the hiding, in one
   * transaction; false when there is no such note. */
  hideNote(
    requestId: string,
    actorId: string,
    reason: ModerationReason,
  ): Promise<boolean>
  /** Shows a hidden note again, recording who did; false when none such is
   * hidden. */
  unhideNote(requestId: string, actorId: string): Promise<boolean>
  /** Deletes the reports handled before `cutoff`; how many went. */
  purgeHandledBefore(cutoff: Date): Promise<number>
}

export interface ModerationService {
  overview(state: 'open' | 'handled'): Promise<ReportedMember[]>
  openMembers(): Promise<number>
  page(memberId: string): Promise<ModerationPage | null>
  dismiss(item: ReportItem, actorId: string): Promise<'dismissed' | 'not_found'>
  hideNote(
    requestId: string,
    actorId: string,
    reason: ModerationReason,
  ): Promise<'hidden' | 'not_found'>
  unhideNote(requestId: string, actorId: string): Promise<'shown' | 'not_found'>
  /** Deletes handled reports older than the retention (R-MOD-11). */
  purgeHandledBefore(cutoff: Date): Promise<number>
}

/** F21: what hosts see of reports, grouped by the member reported, their
 * dismissal, and hiding a note (R-MOD-6..8, ADR 0055). Hiding never
 * deletes, so it can be undone; showing it again reopens no request. */
export function createModeration(store: ModerationStore): ModerationService {
  return {
    overview: (state) => store.overview(state),
    openMembers: () => store.openMembers(),
    page: (memberId) => store.page(memberId),
    dismiss: async (item, actorId) =>
      (await store.dismiss(item, actorId)) ? 'dismissed' : 'not_found',
    hideNote: async (requestId, actorId, reason) =>
      (await store.hideNote(requestId, actorId, reason))
        ? 'hidden'
        : 'not_found',
    unhideNote: async (requestId, actorId) =>
      (await store.unhideNote(requestId, actorId)) ? 'shown' : 'not_found',
    purgeHandledBefore: (cutoff) => store.purgeHandledBefore(cutoff),
  }
}

/** Orders the items of a member's page: open reports first, then the most
 * reported, then the latest (R-MOD-7). */
export function byAttention(a: ModerationItem, b: ModerationItem): number {
  const open = (item: ModerationItem): number =>
    item.reports.filter((report) => report.open).length
  const latest = (item: ModerationItem): string =>
    item.reports.reduce((at, report) => (report.at > at ? report.at : at), '')
  return (
    open(b) - open(a) ||
    b.reports.length - a.reports.length ||
    latest(b).localeCompare(latest(a))
  )
}
