import { getJson, outcomeOf, send } from './request'

/** A pending request as `GET /api/admin/applicants` sends it (R-AUTH-11). */
export interface Applicant {
  id: string
  email: string
  requestedAt: string
  name: string | null
  org: string | null
}

export type Decision = 'approve' | 'reject'

/** What became of a decision, as the host needs to hear it. */
export type DecisionOutcome = 'done' | 'not-pending' | 'link-failed'

export async function fetchApplicants(): Promise<Applicant[]> {
  const { applicants } = await getJson<{ applicants: Applicant[] }>(
    '/api/admin/applicants',
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
  const response = await send(
    `/api/admin/applicants/${encodeURIComponent(id)}/${decision}`,
    'POST',
  )
  return outcomeOf<DecisionOutcome>(response, 'decision failed', {
    204: 'done',
    404: 'not-pending',
    502: 'link-failed',
  })
}
