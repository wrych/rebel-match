import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { ErasureService } from '../services/erasure.js'
import type { MemberRoster } from '../services/member-roster.js'
import { handle, notFound, replyFound, replyOutcome } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

const memberParams = z.object({ id: z.string().min(1) })

const eraseStatus = {
  erased: 204,
  not_found: 404,
  created_invites: 409,
  last_admin: 409,
} as const

// Deleting hides the member now and erases them after the grace period;
// `?now=true` erases at once, for someone who insists (ADR 0032).
function remove(erasure: ErasureService): RequestHandler {
  return handle(
    { params: memberParams },
    async ({ params }, response, request) => {
      if (request.query.now === 'true') {
        replyOutcome(response, eraseStatus, await erasure.erase(params.id))
        return
      }
      const outcome = await erasure.delete(params.id, false)
      if (outcome.result !== 'scheduled') {
        replyOutcome(response, eraseStatus, outcome.result)
        return
      }
      response.json({ eraseAfter: outcome.eraseAfter.toISOString() })
    },
  )
}

function restore(erasure: ErasureService): RequestHandler {
  return async (request, response) => {
    const params = memberParams.safeParse(request.params)
    if (!params.success || !(await erasure.restore(params.data.id))) {
      notFound(response)
      return
    }
    response.status(204).end()
  }
}

/** The roster, one member's page, and deleting with its undo and its
 * erase-now (R-MEM-1,2, R-NFR-7, ADR 0032, design §3), behind
 * `member:delete`. */
export function adminMemberRoutes(deps: {
  auth: AuthProvider
  erasure: ErasureService
  roster: MemberRoster
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'member:delete')

  router.get(apiPaths.adminMembers, guard, async (_request, response) => {
    response.json({ members: await deps.roster.list() })
  })

  router.get(apiPaths.adminMember, guard, async (request, response) => {
    const params = memberParams.safeParse(request.params)
    const member = params.success
      ? await deps.roster.detail(params.data.id)
      : null
    replyFound(response, member, 'member')
  })

  router.delete(apiPaths.adminMember, guard, remove(deps.erasure))
  router.post(apiPaths.restoreMember, guard, restore(deps.erasure))

  return router
}
