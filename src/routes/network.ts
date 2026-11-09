import { Router, type RequestHandler } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { NetworkService } from '../services/network.js'
import { memberOf, notFound } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

// While hosts have the replay off, its address is as absent as one that never
// existed (R-NET-6, R-NAV-8).
function whileOn(settings: Pick<LiveSettings, 'limits'>): RequestHandler {
  return (_request, response, next) => {
    if (settings.limits().networkReplay === 1) {
      next()
      return
    }
    notFound(response)
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
    apiPaths.network,
    whileOn(deps.settings),
    requirePermission(deps.auth, 'network:view'),
    async (_request, response) => {
      response.json(await deps.network.timeline(memberOf(response).id))
    },
  )

  return router
}
