import { Router } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { BadgeService } from '../services/badges.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

/** A member's own badges (R-BADGE-7, R-BADGE-12, design §3). Each member reads
 * only their own, so a session is all this asks; the API guard has already
 * required onboarding. */
export function badgeRoutes(deps: {
  auth: AuthProvider
  badges: BadgeService
}): Router {
  const router = Router()

  router.get(
    '/api/badges',
    requireSession(deps.auth),
    async (_request, response) => {
      const memberId = (response.locals as GuardedLocals).member.id
      response.json(await deps.badges.mine(memberId))
    },
  )

  return router
}
