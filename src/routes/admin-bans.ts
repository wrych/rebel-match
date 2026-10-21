import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { BanService } from '../services/bans.js'
import type { LiveSettings } from '../config.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

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
  return async (request, response) => {
    const { id } = memberParams.parse(request.params)
    const { banNoteMaxChars } = deps.settings.limits()
    const body = banBody(banNoteMaxChars).safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const host = (response.locals as GuardedLocals).member.id
    const outcome = await deps.bans.ban(id, host, body.data.note)
    response.status(banStatus[outcome]).json({ result: outcome })
  }
}

function unban(bans: BanService): RequestHandler {
  return async (request, response) => {
    const { id } = memberParams.parse(request.params)
    const host = (response.locals as GuardedLocals).member.id
    const outcome = await bans.unban(id, host)
    response
      .status(outcome === 'unbanned' ? 204 : 404)
      .json({ result: outcome })
  }
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
