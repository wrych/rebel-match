import { Router, type RequestHandler } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import { recapOpen } from '../recap/open.js'
import type { RecapService } from '../services/recap.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

// Until the recap opens, its address is as absent as one that never
// existed (R-RECAP-1, R-RECAP-8, R-NAV-8).
function whileOpen(
  settings: Pick<LiveSettings, 'limits'>,
  now: () => number,
): RequestHandler {
  return (_request, response, next) => {
    if (recapOpen(settings.limits(), now())) {
      next()
      return
    }
    response.status(404).json({ error: 'not_found' })
  }
}

/** `/api/recap` (design §3): the caller's own summit recap, behind the
 * hosts' switch. Each member reads only their own, so a session is all it
 * asks; the API guard has already required onboarding (R-RECAP-1,
 * R-RECAP-4). */
export function recapRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'limits'>
  recap: RecapService
  now?: () => number
}): Router {
  const router = Router()

  router.get(
    '/api/recap',
    whileOpen(deps.settings, deps.now ?? Date.now),
    requireSession(deps.auth),
    async (_request, response) => {
      const { member } = response.locals as GuardedLocals
      response.json(await deps.recap.mine(member.id))
    },
  )

  return router
}
