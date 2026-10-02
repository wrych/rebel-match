import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { RoleService } from '../services/roles.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

const grantBody = z.object({ role: z.string().min(1) })
const memberParams = z.object({ id: z.string().min(1) })
const holdingParams = memberParams.extend({ role: z.string().min(1) })

const grantStatus = { granted: 204, unknown_role: 400, no_member: 404 } as const
const revokeStatus = {
  revoked: 204,
  unknown_role: 400,
  not_held: 404,
  last_holder: 409,
} as const

/** Grant and revoke roles (R-ROLE-9, design §3), behind `role:grant`. */
export function adminRoleRoutes(deps: {
  auth: AuthProvider
  roles: RoleService
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'role:grant')

  router.post(
    '/api/admin/members/:id/roles',
    guard,
    async (request, response) => {
      const body = grantBody.safeParse(request.body)
      const params = memberParams.safeParse(request.params)
      if (!body.success || !params.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const actor = (response.locals as GuardedLocals).member
      const outcome = await deps.roles.grant(
        actor.id,
        params.data.id,
        body.data.role,
      )
      response.status(grantStatus[outcome]).json({ result: outcome })
    },
  )

  router.delete(
    '/api/admin/members/:id/roles/:role',
    guard,
    async (request, response) => {
      const params = holdingParams.safeParse(request.params)
      if (!params.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const outcome = await deps.roles.revoke(params.data.id, params.data.role)
      response.status(revokeStatus[outcome]).json({ result: outcome })
    },
  )

  return router
}
