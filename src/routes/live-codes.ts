import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { LiveCodeService } from '../services/live-codes.js'
import { whileCodesOn } from './profile-codes.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

const tokenBody = z.object({ token: z.string().min(1).max(100) }).strict()

/** `/api/me/live-codes` and `/api/live-codes/redeem` (design §3): the
 * owner's next live code with who just connected, and scanning one, its
 * token in the body so no request line holds it. Every code that cannot be
 * used answers the same `410` (R-CODE-5..7, R-NFR-9). */
export function liveCodeRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'limits'>
  liveCodes: LiveCodeService
}): Router {
  const router = Router()
  const guards = [whileCodesOn(deps.settings), requireSession(deps.auth)]
  const caller = (locals: unknown): string =>
    (locals as GuardedLocals).member.id

  router.post('/api/me/live-codes', ...guards, async (_request, response) => {
    const issued = await deps.liveCodes.issue(caller(response.locals))
    if (issued.result === 'limit')
      response.status(429).json({ result: 'limit' })
    else response.status(201).json(issued.code)
  })

  router.post(
    '/api/live-codes/redeem',
    ...guards,
    async (request, response) => {
      const { token } = tokenBody.parse(request.body)
      const id = await deps.liveCodes.redeem(caller(response.locals), token)
      if (id === null) response.status(410).json({ error: 'gone' })
      else response.json({ id })
    },
  )

  return router
}
