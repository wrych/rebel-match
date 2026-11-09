import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { RoleService } from '../services/roles.js'
import { grantStatus, revokeStatus } from '../outcomes.js'
import { handle, replyOutcome } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

const grantBody = z.object({ role: z.string().min(1) })
const memberParams = z.object({ id: z.string().min(1) })
const holdingParams = memberParams.extend({ role: z.string().min(1) })

/** Grant and revoke roles (R-ROLE-9, design §3), behind `role:grant`. */
export function adminRoleRoutes(deps: {
  auth: AuthProvider
  roles: RoleService
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'role:grant')

  router.post(
    apiPaths.memberRoles,
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
    apiPaths.memberRole,
    guard,
    handle({ params: holdingParams }, async ({ params }, response) => {
      const outcome = await deps.roles.revoke(params.id, params.role)
      replyOutcome(response, revokeStatus, outcome)
    }),
  )

  return router
}
