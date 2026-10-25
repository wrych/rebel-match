import { Router, type RequestHandler } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { NetworkService } from '../services/network.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

// While hosts have the replay off, its address is as absent as one that never
// existed (R-NET-6, R-NAV-8).
function whileOn(settings: Pick<LiveSettings, 'limits'>): RequestHandler {
  return (_request, response, next) => {
    if (settings.limits().networkReplay === 1) {
      next()
      return
    }
    response.status(404).json({ error: 'not_found' })
  }
}

/** `/api/network` (design §3): the network replay for the caller, behind the
 * hosts' switch and `network:view` (R-NET-1, R-NET-5, R-NET-6). */
export function networkRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'limits'>
  network: NetworkService
}): Router {
  const router = Router()

  router.get(
    '/api/network',
    whileOn(deps.settings),
    requirePermission(deps.auth, 'network:view'),
    async (_request, response) => {
      const { member } = response.locals as GuardedLocals
      response.json(await deps.network.timeline(member.id))
    },
  )

  return router
}
