import type { ModerationReason } from './challenge-moderation.js'
import type { ReportItem } from './reports.js'

/** One reported member on the moderation screen (R-MOD-6). Open counts what
 * no host has handled yet; on the Handled tab, everything ever reported. */
export interface ReportedMember {
  memberId: string
  name: string | null
  email: string
  org: string | null
  status: 'applicant' | 'active' | 'rejected' | 'deleted'
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
  kind: 'hide' | 'unhide' | 'dismiss'
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
  page(memberId: string): Promise<ModerationPage | null>
  /** Marks the item's open reports handled and records the host's dismissal,
   * in one transaction; false when it has none open. */
  dismiss(item: ReportItem, actorId: string): Promise<boolean>
}

export interface ModerationService {
  overview(state: 'open' | 'handled'): Promise<ReportedMember[]>
  page(memberId: string): Promise<ModerationPage | null>
  dismiss(item: ReportItem, actorId: string): Promise<'dismissed' | 'not_found'>
}

/** F21: what hosts see of reports, grouped by the member reported, and their
 * dismissal (R-MOD-6, R-MOD-7, ADR 0055). */
export function createModeration(store: ModerationStore): ModerationService {
  return {
    overview: (state) => store.overview(state),
    page: (memberId) => store.page(memberId),
    dismiss: async (item, actorId) =>
      (await store.dismiss(item, actorId)) ? 'dismissed' : 'not_found',
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
