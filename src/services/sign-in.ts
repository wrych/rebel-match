import type {
  AuthProvider,
  CallerRequest,
  SessionCookie,
  VerifyResult,
} from '../auth/index.js'
import { safeNextPath } from '../routes.js'
import type { Track } from './analytics.js'
import type { ErasureService } from './erasure.js'

/** A started session's cookie and the safe path to go to next, or why the
 * link was refused (R-AUTH-5, R-AUTH-6, R-NAV-6). */
export type SignInResult =
  | { ok: true; cookie: SessionCookie; next: string }
  | Extract<VerifyResult, { ok: false }>

/** Signs in with a link's token from the browser making the request
 * (ADR 0027, ADR 0034). */
export type SignIn = (
  request: CallerRequest,
  token: string,
) => Promise<SignInResult>

/** Verifies the token; a keep-it link first restores the account its member
 * deleted, or the new session would find nobody active (ADR 0032). Any
 * earlier session in the browser ends before the new one starts, and the
 * sign-in is tracked (R-ANA-1). */
export function createSignIn(deps: {
  auth: AuthProvider
  erasure: Pick<ErasureService, 'restoreOwn'>
  track: Track
}): SignIn {
  return async (request, token) => {
    const result = await deps.auth.verifyToken(token)
    if (!result.ok) return result

    if (result.kind === 'restore')
      await deps.erasure.restoreOwn(result.memberId)
    // A browser someone else used, or one handed a planted cookie, must not
    // carry that session past the moment its new owner signs in.
    await deps.auth.endSession(request)
    const cookie = await deps.auth.createSession(result.memberId)
    void deps.track(result.memberId, { name: 'login_completed' })
    return { ok: true, cookie, next: safeNextPath(result.next) }
  }
}
