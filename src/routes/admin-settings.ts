import { Router, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import { defaultConfig, type Config } from '../config.js'
import type { SettingsService } from '../services/settings.js'
import { settingsView } from '../settings-view.js'
import { handle, notFound } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

const keyParams = z.object({ key: z.string().min(1) })
const changeBody = z.object({ value: z.number().int() })

type Deps = {
  auth: AuthProvider
  config: Config
  settings: SettingsService
}

type Respond = (response: Response) => void

function responder(deps: Deps): Respond {
  const defaults = defaultConfig()
  return (response) => {
    response.json({
      groups: settingsView(deps.config, defaults, {
        current: {
          limits: deps.settings.limits(),
          abuse: deps.settings.abuse(),
          game: deps.settings.game(),
          flags: deps.settings.flags(),
        },
        deployment: deps.settings.deployment(),
        overrides: deps.settings.overrides(),
      }),
    })
  }
}

function change(deps: Deps, respond: Respond): RequestHandler {
  return handle(
    { params: keyParams, body: changeBody },
    async ({ params, body, member }, response) => {
      const outcome = await deps.settings.change(
        params.key,
        body.value,
        member.id,
      )
      if (outcome === 'saved') respond(response)
      else if (outcome === 'not_found') notFound(response)
      else response.status(400).json({ error: outcome })
    },
  )
}

function reset(deps: Deps, respond: Respond): RequestHandler {
  return handle({ params: keyParams }, async ({ params }, response) => {
    const outcome = await deps.settings.reset(params.key)
    if (outcome === 'reset') respond(response)
    else if (outcome === 'not_found') notFound(response)
    else response.status(400).json({ error: outcome })
  })
}

/** `/api/admin/settings`: the configuration in named groups behind
 * `settings:read` (R-CFG-5); changing and resetting what R-CFG-6 allows behind
 * `settings:manage`. Each answer carries the groups as they now stand. */
export function adminSettingsRoutes(deps: Deps): Router {
  const router = Router()
  const respond = responder(deps)
  const manage = requirePermission(deps.auth, 'settings:manage')

  router.get(
    apiPaths.settings,
    requirePermission(deps.auth, 'settings:read'),
    (_request, response) => {
      respond(response)
    },
  )
  router.put(apiPaths.setting, manage, change(deps, respond))
  router.delete(apiPaths.setting, manage, reset(deps, respond))

  return router
}
