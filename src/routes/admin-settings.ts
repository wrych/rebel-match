import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import { defaultConfig, type Config } from '../config.js'
import {
  isEditableKey,
  type EditableSettings,
} from '../services/editable-settings.js'
import { settingsView } from '../settings-view.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

const setBody = z.object({ value: z.number().int() })
// Only a key hosts may change passes; anything else is simply not found.
const settingParams = z.object({ key: z.string().refine(isEditableKey) })

function setSetting(settings: EditableSettings): RequestHandler {
  return async (request, response) => {
    const params = settingParams.safeParse(request.params)
    const body = setBody.safeParse(request.body)
    if (!params.success) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const memberId = (response.locals as GuardedLocals).member.id
    const result = await settings.set(
      params.data.key,
      body.data.value,
      memberId,
    )
    if (result !== 'saved') {
      response.status(400).json({ error: result })
      return
    }
    response.status(204).end()
  }
}

function resetSetting(settings: EditableSettings): RequestHandler {
  return async (request, response) => {
    const params = settingParams.safeParse(request.params)
    if (!params.success) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    await settings.reset(params.data.key)
    response.status(204).end()
  }
}

/** `GET /api/admin/settings`: the configuration in named groups, behind
 * `settings:read` (R-CFG-5); `PUT` and `DELETE /api/admin/settings/:key`
 * change what R-CFG-6 allows, behind `settings:manage`. */
export function adminSettingsRoutes(deps: {
  auth: AuthProvider
  config: Config
  settings: EditableSettings
}): Router {
  const router = Router()
  const defaults = defaultConfig()
  const manage = requirePermission(deps.auth, 'settings:manage')

  router.get(
    '/api/admin/settings',
    requirePermission(deps.auth, 'settings:read'),
    (_request, response) => {
      response.json({
        groups: settingsView(deps.config, defaults, deps.settings),
      })
    },
  )
  router.put('/api/admin/settings/:key', manage, setSetting(deps.settings))
  router.delete('/api/admin/settings/:key', manage, resetSetting(deps.settings))

  return router
}
