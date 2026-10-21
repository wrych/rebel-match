import { trackNothing, type Track } from './analytics.js'
import type { ModerationReason } from './challenge-moderation.js'

/** What a report is about: another member's challenge, or the note on a
 * request sent to the reporter (R-MOD-1, R-MOD-2). */
export type ReportItem = { challengeId: string } | { requestId: string }

/** What the report screen shows. A challenge withdrawn or hidden since the
 * member saw it has no text here (R-MOD-4). */
export interface ReportTarget {
  kind: 'challenge' | 'note'
  body: string | null
  trendShort: string | null
  alreadyReported: boolean
}

export type ReportOutcome =
  'reported' | 'not_found' | 'already_reported' | 'too_many'

export interface ReportStore {
  /** The challenge as `reporterId` may report it; null for their own, a
   * draft, one of a deleted member, or none. */
  challengeTarget(
    reporterId: string,
    challengeId: string,
  ): Promise<ReportTarget | null>
  /** The note on a request sent to `reporterId`; null for any other request,
   * one without a note, or one from a deleted member. */
  noteTarget(
    reporterId: string,
    requestId: string,
  ): Promise<ReportTarget | null>
  /** Records the report and declines a pending request it is about, in one
   * transaction, after the same checks as the targets and the daily cap. */
  record(report: {
    id: string
    reporterId: string
    item: ReportItem
    reason: ModerationReason
    comment: string | null
    perDay: number
  }): Promise<ReportOutcome>
}

export interface ReportService {
  target(reporterId: string, item: ReportItem): Promise<ReportTarget | null>
  report(
    reporterId: string,
    input: {
      item: ReportItem
      reason: ModerationReason
      comment: string | null
    },
    newId: () => string,
  ): Promise<ReportOutcome>
}

/** F20: a member reports a challenge or a note; the reported member is never
 * told (R-MOD-3, R-MOD-4). A report is reported as usage by its kind and
 * reason only (R-MOD-12, R-ANA-3). */
export function createReports(deps: {
  store: ReportStore
  perDay: () => number
  track?: Track
}): ReportService {
  const track = deps.track ?? trackNothing
  return {
    target: (reporterId, item) =>
      'challengeId' in item
        ? deps.store.challengeTarget(reporterId, item.challengeId)
        : deps.store.noteTarget(reporterId, item.requestId),
    report: async (reporterId, input, newId) => {
      const outcome = await deps.store.record({
        id: newId(),
        reporterId,
        item: input.item,
        reason: input.reason,
        comment: input.comment,
        perDay: deps.perDay(),
      })
      if (outcome === 'reported')
        void track(reporterId, {
          name: 'content_reported',
          kind: 'challengeId' in input.item ? 'challenge' : 'note',
          reason: input.reason,
        })
      return outcome
    },
  }
}
