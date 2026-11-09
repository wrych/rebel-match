import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type { WhitelistService } from '../services/whitelist.js'
import { handle } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

function whitelistBody(
  limits: Pick<Limits, 'whitelistBatchMax' | 'emailMaxChars'>,
): z.ZodType<{ emails: string[] }> {
  return z.object({
    emails: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .pipe(z.email().max(limits.emailMaxChars)),
      )
      .min(1)
      .max(limits.whitelistBatchMax),
  })
}

/** Pre-approve addresses (R-AUTH-1, design §3), behind `whitelist:manage`. */
export function adminWhitelistRoutes(deps: {
  auth: AuthProvider
  whitelist: WhitelistService
  config: { limits: Pick<Limits, 'whitelistBatchMax' | 'emailMaxChars'> }
}): Router {
  const router = Router()
  const schema = whitelistBody(deps.config.limits)

  router.post(
    apiPaths.whitelist,
    requirePermission(deps.auth, 'whitelist:manage'),
    handle({ body: schema }, async ({ body, member }, response) => {
      const results = await deps.whitelist.add(body.emails, member.id)
      response.json({ results })
    }),
  )

  return router
}
