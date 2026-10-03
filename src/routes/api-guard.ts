import type { RequestHandler } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { MemberProfiles } from '../services/member-profiles.js'

// Paths under /api, as Express sees them below the mount. Health and config
// carry nothing about anyone (R-CFG-2); onboarding is how a member becomes
// onboarded, so it cannot require it (R-ONB-1).
const OPEN = new Set(['/health', '/config'])
const BEFORE_ONBOARDING = new Set(['/onboarding'])

/** The server's own check on every `/api/*` request, whatever the client's
 * guards did (design §3, R-NAV-7, R-ROLE-5): a signed-in active member, and
 * onboarded unless the route is onboarding itself. Nobody signed in is 401;
 * not yet onboarded is 403 with `onboarding_required`. Permission checks
 * still run per route after this. */
export function guardApi(deps: {
  auth: AuthProvider
  profiles: MemberProfiles
}): RequestHandler {
  return async (request, response, next) => {
    if (OPEN.has(request.path)) {
      next()
      return
    }
    const member = await deps.auth.currentMember(request)
    if (member === null) {
      response.status(401).json({ error: 'unauthenticated' })
      return
    }
    if (BEFORE_ONBOARDING.has(request.path)) {
      next()
      return
    }
    const profile = await deps.profiles.profile(member.id)
    if (profile?.onboarded !== true) {
      response.status(403).json({ error: 'onboarding_required' })
      return
    }
    next()
  }
}
