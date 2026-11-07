import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { ProfileCodeService } from '../services/profile-codes.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

/** While hosts have codes off, their addresses are as absent as ones that
 * never existed (R-CODE-1, R-NAV-8). */
export function whileCodesOn(
  settings: Pick<LiveSettings, 'limits'>,
): RequestHandler {
  return (_request, response, next) => {
    if (settings.limits().connectCodes === 1) {
      next()
      return
    }
    response.status(404).json({ error: 'not_found' })
  }
}

const enabledBody = z.object({ enabled: z.boolean() }).strict()
const tokenBody = z.object({ token: z.string().min(1).max(100) }).strict()

/** `/api/me/profile-code` and `/api/profile-codes/open` (design §3): the
 * caller's own profile code, on or off and reset, and opening someone
 * else's, its token in the body so no request line holds it (R-CODE-2..4,
 * R-NFR-9). The API guard has already required onboarding. */
export function profileCodeRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'limits'>
  profileCodes: ProfileCodeService
}): Router {
  const router = Router()
  const guards = [whileCodesOn(deps.settings), requireSession(deps.auth)]
  const caller = (locals: unknown): string =>
    (locals as GuardedLocals).member.id

  router.get('/api/me/profile-code', ...guards, async (_request, response) => {
    response.json(await deps.profileCodes.mine(caller(response.locals)))
  })

  router.patch('/api/me/profile-code', ...guards, async (request, response) => {
    const { enabled } = enabledBody.parse(request.body)
    response.json(
      await deps.profileCodes.setEnabled(caller(response.locals), enabled),
    )
  })

  router.post(
    '/api/me/profile-code/reset',
    ...guards,
    async (_request, response) => {
      response.json(await deps.profileCodes.reset(caller(response.locals)))
    },
  )

  router.post(
    '/api/profile-codes/open',
    ...guards,
    async (request, response) => {
      const { token } = tokenBody.parse(request.body)
      const opened = await deps.profileCodes.open(
        caller(response.locals),
        token,
      )
      if (opened === null) response.status(404).json({ error: 'not_found' })
      else response.json(opened)
    },
  )

  return router
}
