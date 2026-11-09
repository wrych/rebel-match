import { Router } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { PresentationService } from '../services/presentation.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

/** `/api/admin/presentation` (design §3): the summit film's data, behind
 * `network:present` (R-PRES-1, R-PRES-6). */
export function presentationRoutes(deps: {
  auth: AuthProvider
  presentation: PresentationService
}): Router {
  const router = Router()

  router.get(
    apiPaths.presentation,
    requirePermission(deps.auth, 'network:present'),
    async (_request, response) => {
      response.json(await deps.presentation.show())
    },
  )

  return router
}
