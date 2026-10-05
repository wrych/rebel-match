import type { Purged } from './store.js'
import type { Permission } from '../access.js'

/** `restore` keeps an account its member deleted, before signing in
 * (ADR 0032). */
export type LinkKind = 'self_service' | 'approval' | 'restore'

/** Who is calling, already resolved. Handlers see this and never a token, a
 * cookie, or a provider's claims (ADR 0015). */
export interface MemberRef {
  id: string
  roles: string[]
  permissions: Permission[]
}

export type VerifyResult =
  | { ok: true; memberId: string; next: string; kind: LinkKind }
  | { ok: false; reason: 'unknown' | 'expired' | 'used' }

/** A cookie for the route to set verbatim. Its name, value and flags are the
 * seam's business; the route only applies it. */
export interface SessionCookie {
  name: string
  value: string
  options: {
    httpOnly: true
    secure: boolean
    sameSite: 'lax'
    path: '/'
    maxAge: number
  }
}

/** The part of a request the seam reads. Narrower than Express's Request so a
 * test can build one by hand. */
export interface CallerRequest {
  headers: { cookie?: string | undefined }
}

/** A magic link ready to send. `url` carries the raw token, so it goes to the
 * mailer and nowhere else. */
export interface OutgoingLink {
  memberId: string
  email: string
  kind: LinkKind
  url: string
  /** For a `restore` link: when the account will otherwise be erased. */
  eraseAfter?: Date
}

/** What to issue: the kind, the deep link to return to, and for a `restore`
 * link the date the account would be erased. */
export interface LinkOptions {
  kind: LinkKind
  next?: string | undefined
  eraseAfter?: Date | undefined
}

/** Hands an issued link to whatever delivers mail (design §1). */
export type LinkDelivery = (link: OutgoingLink) => Promise<void>

/** The only way the application proves who a member is (ADR 0015). Routes and
 * services receive this interface, never a concrete implementation. */
export interface AuthProvider {
  issueLink(email: string, opts: LinkOptions): Promise<void>
  verifyToken(raw: string): Promise<VerifyResult>
  createSession(memberId: string): Promise<SessionCookie>
  currentMember(request: CallerRequest): Promise<MemberRef | null>
  /** Slides a live session's idle expiry (ADR 0020). Returns the cookie to set
   * when it was extended, null when nothing changed. */
  renewSession(request: CallerRequest): Promise<SessionCookie | null>
  endSession(request: CallerRequest): Promise<SessionCookie>
  /** Removes expired sessions and tokens from the store (ADR 0034). */
  purgeExpired(): Promise<Purged>
}
