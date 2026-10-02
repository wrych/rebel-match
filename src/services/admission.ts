import type { AuthProvider } from '../auth/index.js'
import type { ApplicantHandles } from './applicant-handle.js'

export type MemberStatus = 'applicant' | 'active' | 'rejected' | 'deleted'

export type Admission =
  'send-link' | 'record-applicant' | 'already-asked' | 'not-approved'

/** What a request for a link does, by the address's status (R-AUTH-1,2,4):
 * an active member gets a link; an unknown address becomes an applicant; a
 * pending one is told the same again; a rejected one is told plainly that it
 * was not approved (R-AUTH-13). Only a new applicant notifies anyone. */
export function admissionFor(status: MemberStatus | null): Admission {
  if (status === 'active') return 'send-link'
  if (status === null) return 'record-applicant'
  if (status === 'rejected') return 'not-approved'
  return 'already-asked'
}

export interface AdmissionStore {
  statusByEmail(email: string): Promise<MemberStatus | null>
  /** Records a pending applicant; false when the address already exists. */
  createApplicant(email: string): Promise<boolean>
  /** Takes back an applicant this request created, while still pending. */
  removeApplicant(email: string): Promise<void>
  /** Adds what the applicant said about themselves, keeping any part they
   * leave out; false when the address is not a pending applicant. */
  describeApplicant(email: string, details: ApplicantDetails): Promise<boolean>
}

export interface ApplicantDetails {
  name?: string | undefined
  org?: string | undefined
}

export type LinkRequestState =
  'check-email' | 'access-requested' | 'not-approved'

/** The login screen's next step. The request that records an applicant also
 * carries the handle that lets them describe it (R-AUTH-11). */
export interface LinkRequest {
  state: LinkRequestState
  handle?: string
}

export interface AdmissionService {
  requestLink(email: string, next?: string): Promise<LinkRequest>
  /** `POST /auth/applicant`: not-found for a handle that does not hold or a
   * request no longer pending. */
  describeApplicant(
    handle: string,
    details: ApplicantDetails,
  ): Promise<'saved' | 'not-found'>
}

/** `POST /auth/request-link`'s decision. Admission policy lives here, outside
 * the auth seam, which only issues the link (ADR 0015). */
export function createAdmission(deps: {
  store: AdmissionStore
  auth: Pick<AuthProvider, 'issueLink'>
  handles: ApplicantHandles
  notifyReviewers: (applicantEmail: string) => Promise<void>
}): AdmissionService {
  return {
    requestLink: async (email, next) => {
      const admission = admissionFor(await deps.store.statusByEmail(email))

      if (admission === 'send-link') {
        await deps.auth.issueLink(email, { kind: 'self_service', next })
        return { state: 'check-email' }
      }
      if (admission === 'not-approved') return { state: 'not-approved' }
      // Anyone can ask again for an address, so only the request that
      // recorded the applicant gets the handle to describe it.
      const created =
        admission === 'record-applicant' && (await recordApplicant(deps, email))
      return created
        ? { state: 'access-requested', handle: deps.handles.issue(email) }
        : { state: 'access-requested' }
    },
    describeApplicant: async (handle, details) => {
      const email = deps.handles.read(handle)
      if (email === null) return 'not-found'

      const saved = await deps.store.describeApplicant(email, details)
      return saved ? 'saved' : 'not-found'
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
): Promise<boolean> {
  if (!(await deps.store.createApplicant(email))) return false
  try {
    await deps.notifyReviewers(email)
  } catch (error) {
    await deps.store.removeApplicant(email)
    throw error
  }
  return true
}
