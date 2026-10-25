import { Router, type RequestHandler } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { RecapService } from '../services/recap.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

// Until hosts open the recap, its address is as absent as one that never
// existed (R-RECAP-1, R-NAV-8).
function whileOn(settings: Pick<LiveSettings, 'limits'>): RequestHandler {
  return (_request, response, next) => {
    if (settings.limits().recap === 1) {
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
}): Router {
  const router = Router()

  router.get(
    '/api/recap',
    whileOn(deps.settings),
    requireSession(deps.auth),
    async (_request, response) => {
      const { member } = response.locals as GuardedLocals
      response.json(await deps.recap.mine(member.id))
    },
  )

  return router
}
