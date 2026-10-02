import type { AuthProvider } from '../auth/index.js'

export type MemberStatus = 'applicant' | 'active' | 'rejected' | 'deleted'

export type Admission = 'send-link' | 'record-applicant' | 'already-asked'

/** What a request for a link does, by the address's status (R-AUTH-1,2,4):
 * an active member gets a link; an unknown address becomes an applicant; one
 * already asked, or refused, is told the same and nobody is notified again. */
export function admissionFor(status: MemberStatus | null): Admission {
  if (status === 'active') return 'send-link'
  if (status === null) return 'record-applicant'
  return 'already-asked'
}

export interface AdmissionStore {
  statusByEmail(email: string): Promise<MemberStatus | null>
  /** Records a pending applicant; false when the address already exists. */
  createApplicant(email: string): Promise<boolean>
  /** Takes back an applicant this request created, while still pending. */
  removeApplicant(email: string): Promise<void>
}

export type LinkRequestState = 'check-email' | 'access-requested'

export interface AdmissionService {
  requestLink(email: string, next?: string): Promise<LinkRequestState>
}

/** `POST /auth/request-link`'s decision. Admission policy lives here, outside
 * the auth seam, which only issues the link (ADR 0015). */
export function createAdmission(deps: {
  store: AdmissionStore
  auth: Pick<AuthProvider, 'issueLink'>
  notifyReviewers: (applicantEmail: string) => Promise<void>
}): AdmissionService {
  return {
    requestLink: async (email, next) => {
      const admission = admissionFor(await deps.store.statusByEmail(email))

      if (admission === 'send-link') {
        await deps.auth.issueLink(email, { kind: 'self_service', next })
        return 'check-email'
      }
      if (admission === 'record-applicant') await recordApplicant(deps, email)
      return 'access-requested'
    },
  }
}

// An applicant nobody was told about is invisible to the host, and a retry
// would find them already asked. So a failed notice takes the applicant back
// and fails the request: retrying starts over, and reviewers hear of it.
async function recordApplicant(
  deps: {
    store: AdmissionStore
    notifyReviewers: (applicantEmail: string) => Promise<void>
  },
  email: string,
): Promise<void> {
  if (!(await deps.store.createApplicant(email))) return
  try {
    await deps.notifyReviewers(email)
  } catch (error) {
    await deps.store.removeApplicant(email)
    throw error
  }
}
