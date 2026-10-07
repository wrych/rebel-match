import { Router, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import { defaultConfig, type Config } from '../config.js'
import type { SettingsService } from '../services/settings.js'
import { settingsView } from '../settings-view.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

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
        },
        deployment: deps.settings.deployment(),
        overrides: deps.settings.overrides(),
      }),
    })
  }
}

function change(deps: Deps, respond: Respond): RequestHandler {
  return async (request, response) => {
    const { key } = keyParams.parse(request.params)
    const input = changeBody.safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const member = (response.locals as GuardedLocals).member.id
    const outcome = await deps.settings.change(key, input.data.value, member)
    if (outcome === 'saved') respond(response)
    else if (outcome === 'not_found')
      response.status(404).json({ error: 'not_found' })
    else response.status(400).json({ error: outcome })
  }
}

function reset(deps: Deps, respond: Respond): RequestHandler {
  return async (request, response) => {
    const { key } = keyParams.parse(request.params)
    const outcome = await deps.settings.reset(key)
    if (outcome === 'reset') respond(response)
    else if (outcome === 'not_found')
      response.status(404).json({ error: 'not_found' })
    else response.status(400).json({ error: outcome })
  }
}

/** `/api/admin/settings`: the configuration in named groups behind
 * `settings:read` (R-CFG-5); changing and resetting what R-CFG-6 allows behind
 * `settings:manage`. Each answer carries the groups as they now stand. */
export function adminSettingsRoutes(deps: Deps): Router {
  const router = Router()
  const respond = responder(deps)
  const manage = requirePermission(deps.auth, 'settings:manage')

  router.get(
    '/api/admin/settings',
    requirePermission(deps.auth, 'settings:read'),
    (_request, response) => {
      respond(response)
    },
  )
  router.put('/api/admin/settings/:key', manage, change(deps, respond))
  router.delete('/api/admin/settings/:key', manage, reset(deps, respond))

  return router
}
