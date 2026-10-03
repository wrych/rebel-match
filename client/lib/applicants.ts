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
  const response = await fetch('/api/admin/applicants')
  if (!response.ok)
    throw new Error(`applicants unavailable (${String(response.status)})`)
  return ((await response.json()) as { applicants: Applicant[] }).applicants
}

/** Approves or rejects one applicant (F10). Throws on anything the host
 * cannot act on, so a failure is never shown as done. */
export async function decide(
  id: string,
  decision: Decision,
): Promise<DecisionOutcome> {
  const response = await fetch(
    `/api/admin/applicants/${encodeURIComponent(id)}/${decision}`,
    { method: 'POST' },
  )
  if (response.status === 204) return 'done'
  if (response.status === 404) return 'not-pending'
  if (response.status === 502) return 'link-failed'
  throw new Error(`decision failed (${String(response.status)})`)
}
