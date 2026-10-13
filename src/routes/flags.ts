import { Router } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import { assign } from '../flags.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

/** `GET /api/flags` (design §3): the caller's variant of every experiment,
 * decided on the server from their id, so nothing is stored and no flag
 * service sees who they are (R-EXP-1, ADR 0052). */
export function flagRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'flags'>
}): Router {
  const router = Router()

  router.get('/api/flags', requireSession(deps.auth), (_request, response) => {
    const member = (response.locals as GuardedLocals).member
    response.json({ flags: assign(member.id, deps.settings.flags()) })
  })

  return router
}
