import type { ModerationReason } from '../../src/services/challenge-moderation'
import type {
  ReportItem,
  ReportOutcome,
  ReportTarget,
} from '../../src/services/reports'
import { findJson, outcomeOf, send } from './request'

export type { ReportItem, ReportOutcome, ReportTarget }

const targetPath = (item: ReportItem): string =>
  'challengeId' in item
    ? `/api/reports/challenge/${encodeURIComponent(item.challengeId)}`
    : `/api/reports/request/${encodeURIComponent(item.requestId)}`

/** What the report screen shows; null when there is nothing the member may
 * report there (R-NAV-8). */
export async function fetchReportTarget(
  item: ReportItem,
): Promise<ReportTarget | null> {
  const found = await findJson<{ target: ReportTarget }>(
    targetPath(item),
    'report target unavailable',
  )
  return found?.target ?? null
}

/** Sends a report (R-MOD-3, R-MOD-4). Throws on anything the member cannot
 * act on, so a failure never passes for sent. */
export async function sendReport(
  item: ReportItem,
  reason: ModerationReason,
  comment: string,
): Promise<ReportOutcome> {
  const response = await send('/api/reports', 'POST', {
    ...item,
    reason,
    comment,
  })
  return outcomeOf<ReportOutcome>(response, 'report not sent', {
    204: 'reported',
    404: 'not_found',
    409: 'already_reported',
    429: 'too_many',
  })
}

/** Where a report link leads (design S38). */
export function reportPath(item: ReportItem): string {
  return 'challengeId' in item
    ? `/report/challenge/${encodeURIComponent(item.challengeId)}`
    : `/report/request/${encodeURIComponent(item.requestId)}`
}
