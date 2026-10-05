import type { AuthProvider, LinkOptions } from '../auth/index.js'
import type { Client, PacedGate } from './paced-gate.js'
import type { ApplicantHandles } from './applicant-handle.js'
import type { Challenge } from './human-check.js'
import type { RedeemInvite } from './invite-redemption.js'

export type MemberStatus = 'applicant' | 'active' | 'rejected' | 'deleted'

export type Admission =
  | 'send-link'
  | 'record-applicant'
  | 'already-asked'
  | 'not-approved'
  | 'set-to-be-deleted'

/** What a request for a link does, by the address's status (R-AUTH-1,2,4):
 * an active member gets a link; an unknown address becomes an applicant; a
 * pending one is told the same again; a rejected one is told plainly that it
 * was not approved (R-AUTH-13). Only a new applicant notifies anyone. */
export function admissionFor(status: MemberStatus | null): Admission {
  if (status === 'active') return 'send-link'
  if (status === null) return 'record-applicant'
  if (status === 'rejected') return 'not-approved'
  if (status === 'deleted') return 'set-to-be-deleted'
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
  /** When an account its own member deleted will be erased; null when a host
   * deleted it, or it is not deleted (ADR 0032). */
  ownDeletion(email: string): Promise<Date | null>
}

export interface ApplicantDetails {
  name?: string | undefined
  org?: string | undefined
}

export type LinkRequestState =
  | 'check-email'
  | 'access-requested'
  | 'not-approved'
  | 'human-check'
  | 'try-later'

/** The login screen's next step, with the applicant's handle (R-AUTH-11),
 * the invalid-invite notice (R-INV-5), or the human check's challenge;
 * `try-later` is the applicant ceiling (R-NFR-8). */
export interface LinkRequest {
  state: LinkRequestState
  handle?: string
  inviteRefused?: true
  challenge?: Challenge
}

/** What came with the address: the deep link to return to (R-NAV-5), the
 * invite token from the QR (R-INV-1), and who is asking (R-NFR-8). */
export interface LinkRequestOptions {
  next?: string | undefined
  invite?: string | undefined
  client: Client
}

export interface AdmissionService {
  requestLink(email: string, opts: LinkRequestOptions): Promise<LinkRequest>
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
  /** New applicants, paced per IP address (R-NFR-8). */
  applicants: PacedGate
  /** Link emails, paced per address (R-NFR-8, ADR 0030). */
  linkEmails: PacedGate
  now?: () => Date
}

/** `POST /auth/request-link`'s decision. Admission policy lives here, outside
 * the auth seam, which only issues the link (ADR 0015). */
export function createAdmission(deps: AdmissionDeps): AdmissionService {
  const requestLink = async (
    email: string,
    opts: LinkRequestOptions,
  ): Promise<LinkRequest> => {
    const admission = admissionFor(await deps.store.statusByEmail(email))

    if (admission === 'send-link') return sendLink(deps, email, opts)
    if (admission === 'not-approved') return { state: 'not-approved' }
    if (admission === 'already-asked') return { state: 'access-requested' }
    if (admission === 'set-to-be-deleted') return keepItLink(deps, email, opts)
    if (opts.invite === undefined)
      return queueApplicant(deps, email, opts.client, {})

    const now = (deps.now ?? ((): Date => new Date()))()
    const redemption = await deps.redeemInvite(email, opts.invite, now)
    if (redemption.result === 'admitted') return sendLink(deps, email, opts)
    if (redemption.result === 'address_taken')
      return requestLink(email, { next: opts.next, client: opts.client })
    return queueApplicant(deps, email, opts.client, { inviteRefused: true })
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

// Past the address's ceiling the answer is the same and nothing is sent, so
// the limit tells a caller nothing more about the address (R-NFR-8). A null
// `link` is paced the same way and sends nothing, for an address that must
// answer as a member's without hearing anything (ADR 0032).
async function sendLink(
  deps: AdmissionDeps,
  email: string,
  opts: LinkRequestOptions,
  link: LinkOptions | null = { kind: 'self_service', next: opts.next },
): Promise<LinkRequest> {
  const decision = await deps.linkEmails.admit(email, opts.client.altcha)
  if (decision.result === 'human-check')
    return { state: 'human-check', challenge: decision.challenge }
  if (decision.result === 'admit' && link !== null) {
    try {
      await deps.auth.issueLink(email, link)
    } catch (error) {
      deps.linkEmails.release(email)
      throw error
    }
  }
  return { state: 'check-email' }
}

// A deleted account answers as an active one does, so the screen reveals
// nothing; only its member's inbox hears of the deletion, with a link to keep
// it, and a host's deletion sends nothing at all (ADR 0032).
async function keepItLink(
  deps: AdmissionDeps,
  email: string,
  opts: LinkRequestOptions,
): Promise<LinkRequest> {
  const eraseAfter = await deps.store.ownDeletion(email)
  return sendLink(
    deps,
    email,
    opts,
    eraseAfter === null ? null : { kind: 'restore', eraseAfter },
  )
}

// Anyone can ask again for an address, so only the request that recorded the
// applicant gets the handle to describe it.
async function queueApplicant(
  deps: AdmissionDeps,
  email: string,
  client: Client,
  flags: { inviteRefused?: true },
): Promise<LinkRequest> {
  const decision = await deps.applicants.admit(client.ip, client.altcha)
  if (decision.result === 'try-later') return { state: 'try-later' }
  if (decision.result === 'human-check')
    return { state: 'human-check', challenge: decision.challenge }

  let created: boolean
  try {
    created = await recordApplicant(deps, email)
  } catch (error) {
    deps.applicants.release(client.ip)
    throw error
  }
  if (!created) deps.applicants.release(client.ip)
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
