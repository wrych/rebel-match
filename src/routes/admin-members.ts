import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { ErasureService } from '../services/erasure.js'
import type { MemberRoster } from '../services/member-roster.js'
import { requirePermission } from './require-permission.js'

const memberParams = z.object({ id: z.string().min(1) })

const eraseStatus = {
  erased: 204,
  not_found: 404,
  created_invites: 409,
  last_admin: 409,
} as const

/** The roster and GDPR erasure (R-NFR-7, design §3), behind `member:delete`. */
export function adminMemberRoutes(deps: {
  auth: AuthProvider
  erasure: ErasureService
  roster: MemberRoster
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'member:delete')

  router.get('/api/admin/members', guard, async (_request, response) => {
    response.json({ members: await deps.roster.list() })
  })

  router.delete('/api/admin/members/:id', guard, async (request, response) => {
    const params = memberParams.safeParse(request.params)
    if (!params.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const outcome = await deps.erasure.erase(params.data.id)
    response.status(eraseStatus[outcome]).json({ result: outcome })
  })

  return router
}
