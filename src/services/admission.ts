import type { AuthProvider } from '../auth/index.js'
import type { ApplicantHandles } from './applicant-handle.js'
import type { RedeemInvite } from './invite-redemption.js'

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
 * carries the handle that lets them describe it (R-AUTH-11); `inviteRefused`
 * asks for the invalid-invite notice (R-INV-5). */
export interface LinkRequest {
  state: LinkRequestState
  handle?: string
  inviteRefused?: true
}

/** What came with the address: the deep link to return to (R-NAV-5) and the
 * invite token from the QR (R-INV-1). */
export interface LinkRequestOptions {
  next?: string | undefined
  invite?: string | undefined
}

export interface AdmissionService {
  requestLink(email: string, opts?: LinkRequestOptions): Promise<LinkRequest>
  /** `POST /auth/applicant`: not-found for a handle that does not hold or a
   * request no longer pending. */
  describeApplicant(
    handle: string,
    details: ApplicantDetails,
  ): Promise<'saved' | 'not-found'>
}

interface AdmissionDeps {
  store: AdmissionStore
  auth: Pick<AuthProvider, 'issueLink'>
  handles: ApplicantHandles
  notifyReviewers: (applicantEmail: string) => Promise<void>
  redeemInvite: RedeemInvite
  now?: () => Date
}

/** `POST /auth/request-link`'s decision. Admission policy lives here, outside
 * the auth seam, which only issues the link (ADR 0015). */
export function createAdmission(deps: AdmissionDeps): AdmissionService {
  const requestLink = async (
    email: string,
    opts: LinkRequestOptions = {},
  ): Promise<LinkRequest> => {
    const admission = admissionFor(await deps.store.statusByEmail(email))

    if (admission === 'send-link') return sendLink(deps, email, opts.next)
    if (admission === 'not-approved') return { state: 'not-approved' }
    if (admission === 'already-asked') return { state: 'access-requested' }
    if (opts.invite === undefined) return queueApplicant(deps, email, {})

    const now = (deps.now ?? ((): Date => new Date()))()
    const redemption = await deps.redeemInvite(email, opts.invite, now)
    if (redemption.result === 'admitted')
      return sendLink(deps, email, opts.next)
    if (redemption.result === 'address_taken')
      return requestLink(email, { next: opts.next })
    return queueApplicant(deps, email, { inviteRefused: true })
  }

  return {
    requestLink,
    describeApplicant: async (handle, details) => {
      const email = deps.handles.read(handle)
      if (email === null) return 'not-found'

      const saved = await deps.store.describeApplicant(email, details)
      return saved ? 'saved' : 'not-found'
    },
  }
}

async function sendLink(
  deps: AdmissionDeps,
  email: string,
  next: string | undefined,
): Promise<LinkRequest> {
  await deps.auth.issueLink(email, { kind: 'self_service', next })
  return { state: 'check-email' }
}

// Anyone can ask again for an address, so only the request that recorded the
// applicant gets the handle to describe it.
async function queueApplicant(
  deps: AdmissionDeps,
  email: string,
  flags: { inviteRefused?: true },
): Promise<LinkRequest> {
  const created = await recordApplicant(deps, email)
  return {
    state: 'access-requested',
    ...(created ? { handle: deps.handles.issue(email) } : {}),
    ...flags,
  }
}

// An applicant nobody was told about is invisible to the host, and a retry
// would find them already asked. So a failed notice takes the applicant back
// and fails the request: retrying starts over, and reviewers hear of it.
async function recordApplicant(
  deps: AdmissionDeps,
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
