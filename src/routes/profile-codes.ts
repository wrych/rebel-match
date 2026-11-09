import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { ProfileCodeService } from '../services/profile-codes.js'
import { handle, memberOf, notFound, replyFound } from './handle.js'
import { requireSession } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

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
    notFound(response)
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

  router.get(apiPaths.profileCode, ...guards, async (_request, response) => {
    response.json(await deps.profileCodes.mine(memberOf(response).id))
  })

  router.patch(
    apiPaths.profileCode,
    ...guards,
    handle({ body: enabledBody }, async ({ body, member }, response) => {
      response.json(await deps.profileCodes.setEnabled(member.id, body.enabled))
    }),
  )

  router.post(
    apiPaths.resetProfileCode,
    ...guards,
    async (_request, response) => {
      response.json(await deps.profileCodes.reset(memberOf(response).id))
    },
  )

  router.post(
    apiPaths.openProfileCode,
    ...guards,
    handle({ body: tokenBody }, async ({ body, member }, response) => {
      replyFound(response, await deps.profileCodes.open(member.id, body.token))
    }),
  )

  return router
}
