import { apiPaths, fill } from '../../src/api-paths'
import { reportStatus } from '../../src/outcomes'
import type { ModerationReason } from '../../src/services/challenge-moderation'
import type {
  ReportItem,
  ReportOutcome,
  ReportTarget,
} from '../../src/services/reports'
import { findJson, outcomeFrom, send } from './request'
import { pathTo } from '../../src/routes'

export type { ReportItem, ReportOutcome, ReportTarget }

const targetPath = (item: ReportItem): string =>
  'challengeId' in item
    ? fill(apiPaths.challengeReport, { id: item.challengeId })
    : fill(apiPaths.requestReport, { id: item.requestId })

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
  const response = await send(apiPaths.reports, 'POST', {
    ...item,
    reason,
    comment,
  })
  return outcomeFrom(response, 'report not sent', reportStatus)
}

/** Where a report link leads (design S38). */
export function reportPath(item: ReportItem): string {
  return 'challengeId' in item
    ? pathTo('report-challenge', { id: item.challengeId })
    : pathTo('report-request', { id: item.requestId })
}
