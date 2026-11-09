import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { BanService } from '../services/bans.js'
import type { LiveSettings } from '../config.js'
import { handle, replyOutcome } from './handle.js'
import { requirePermission } from './require-permission.js'

type Deps = {
  auth: AuthProvider
  bans: BanService
  settings: Pick<LiveSettings, 'limits'>
}

const memberParams = z.object({ id: z.string().min(1) })
const banBody = (maxChars: number): z.ZodType<{ note: string }> =>
  z.object({ note: z.string().trim().min(1).max(maxChars) })
const banStatus = {
  banned: 204,
  not_found: 404,
  self: 409,
  last_admin: 409,
} as const

function ban(deps: Deps): RequestHandler {
  return handle(
    () => ({
      params: memberParams,
      body: banBody(deps.settings.limits().banNoteMaxChars),
    }),
    async ({ params, body, member }, response) => {
      const outcome = await deps.bans.ban(params.id, member.id, body.note)
      replyOutcome(response, banStatus, outcome)
    },
  )
}

function unban(bans: BanService): RequestHandler {
  return handle(
    { params: memberParams },
    async ({ params, member }, response) => {
      const outcome = await bans.unban(params.id, member.id)
      response
        .status(outcome === 'unbanned' ? 204 : 404)
        .json({ result: outcome })
    },
  )
}

/** Banning a member and lifting it (R-MOD-9, design §3), behind
 * `member:ban`. The reason is for hosts only. */
export function adminBanRoutes(deps: Deps): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'member:ban')
  router.post('/api/admin/members/:id/ban', guard, ban(deps))
  router.post('/api/admin/members/:id/unban', guard, unban(deps.bans))
  return router
}
