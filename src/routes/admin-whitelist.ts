import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type { WhitelistService } from '../services/whitelist.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

function whitelistBody(
  limits: Pick<Limits, 'whitelistBatchMax'>,
): z.ZodType<{ emails: string[] }> {
  return z.object({
    emails: z
      .array(z.string().trim().toLowerCase().pipe(z.email()))
      .min(1)
      .max(limits.whitelistBatchMax),
  })
}

/** Pre-approve addresses (R-AUTH-1, design §3), behind `whitelist:manage`. */
export function adminWhitelistRoutes(deps: {
  auth: AuthProvider
  whitelist: WhitelistService
  config: { limits: Pick<Limits, 'whitelistBatchMax'> }
}): Router {
  const router = Router()
  const schema = whitelistBody(deps.config.limits)

  router.post(
    '/api/admin/whitelist',
    requirePermission(deps.auth, 'whitelist:manage'),
    async (request, response) => {
      const body = schema.safeParse(request.body)
      if (!body.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const actor = (response.locals as GuardedLocals).member
      const results = await deps.whitelist.add(body.data.emails, actor.id)
      response.json({ results })
    },
  )

  return router
}
