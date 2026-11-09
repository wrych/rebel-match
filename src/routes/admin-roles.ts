import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { RoleService } from '../services/roles.js'
import { handle, replyOutcome } from './handle.js'
import { requirePermission } from './require-permission.js'

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
    handle(
      { params: memberParams, body: grantBody },
      async ({ params, body, member }, response) => {
        const outcome = await deps.roles.grant(member.id, params.id, body.role)
        replyOutcome(response, grantStatus, outcome)
      },
    ),
  )

  router.delete(
    '/api/admin/members/:id/roles/:role',
    guard,
    handle({ params: holdingParams }, async ({ params }, response) => {
      const outcome = await deps.roles.revoke(params.id, params.role)
      replyOutcome(response, revokeStatus, outcome)
    }),
  )

  return router
}
