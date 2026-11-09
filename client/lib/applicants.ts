import { apiPaths, fill } from '../../src/api-paths'
import { approveStatus, rejectStatus } from '../../src/outcomes'
import { getJson, outcomeFrom, send } from './request'

/** A pending request as `GET /api/admin/applicants` sends it (R-AUTH-11). */
export interface Applicant {
  id: string
  email: string
  requestedAt: string
  name: string | null
  org: string | null
}

export type Decision = 'approve' | 'reject'

const decisionPaths = {
  approve: apiPaths.approveApplicant,
  reject: apiPaths.rejectApplicant,
} as const

/** What became of a decision, as the host needs to hear it. */
export type DecisionOutcome = 'done' | 'not-pending' | 'link-failed'

export async function fetchApplicants(): Promise<Applicant[]> {
  const { applicants } = await getJson<{ applicants: Applicant[] }>(
    apiPaths.applicants,
    'applicants unavailable',
  )
  return applicants
}

/** Approves or rejects one applicant (F10). Throws on anything the host
 * cannot act on, so a failure is never shown as done. */
export async function decide(
  id: string,
  decision: Decision,
): Promise<DecisionOutcome> {
  const response = await send(fill(decisionPaths[decision], { id }), 'POST')
  return decision === 'approve'
    ? outcomeFrom(response, 'decision failed', approveStatus, {
        approved: 'done',
        not_pending: 'not-pending',
        link_failed: 'link-failed',
      })
    : outcomeFrom(response, 'decision failed', rejectStatus, {
        rejected: 'done',
        not_pending: 'not-pending',
      })
}
