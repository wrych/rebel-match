import { Router, type RequestHandler } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import { recapOpen } from '../recap/open.js'
import type { RecapService } from '../services/recap.js'
import { memberOf, notFound } from './handle.js'
import { requireSession } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

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
    notFound(response)
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
    apiPaths.recap,
    whileOpen(deps.settings, deps.now ?? Date.now),
    requireSession(deps.auth),
    async (_request, response) => {
      response.json(await deps.recap.mine(memberOf(response).id))
    },
  )

  return router
}
