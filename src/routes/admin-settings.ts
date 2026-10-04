import { Router } from 'express'
import type { AuthProvider } from '../auth/index.js'
import { defaultConfig, type Config } from '../config.js'
import { settingsView } from '../settings-view.js'
import { requirePermission } from './require-permission.js'

/** `GET /api/admin/settings`: the configuration in named groups, read-only,
 * behind `settings:read` (R-CFG-5). */
export function adminSettingsRoutes(deps: {
  auth: AuthProvider
  config: Config
}): Router {
  const router = Router()
  const groups = settingsView(deps.config, defaultConfig())

  router.get(
    '/api/admin/settings',
    requirePermission(deps.auth, 'settings:read'),
    (_request, response) => {
      response.json({ groups })
    },
  )

  return router
}
