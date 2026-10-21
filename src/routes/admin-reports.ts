import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { ModerationService } from '../services/moderation.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

const stateQuery = z.object({
  state: z.enum(['open', 'handled']).default('open'),
})
const memberParams = z.object({ memberId: z.string().min(1) })
const dismissBody = z.union([
  z.object({ challengeId: z.string().min(1) }).strict(),
  z.object({ requestId: z.string().min(1) }).strict(),
])

function dismiss(moderation: ModerationService): RequestHandler {
  return async (request, response) => {
    const item = dismissBody.safeParse(request.body)
    if (!item.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const host = (response.locals as GuardedLocals).member.id
    const outcome = await moderation.dismiss(item.data, host)
    response
      .status(outcome === 'dismissed' ? 204 : 404)
      .json({ result: outcome })
  }
}

/** F21's API (design §3): reported members, one member's reports and the
 * history of what hosts did, and dismissing an item's reports, behind
 * `report:review` (R-MOD-6, R-MOD-7, R-MOD-12). */
export function adminReportRoutes(deps: {
  auth: AuthProvider
  moderation: ModerationService
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'report:review')

  router.get('/api/admin/reports', guard, async (request, response) => {
    const query = stateQuery.safeParse(request.query)
    if (!query.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    response.json({
      members: await deps.moderation.overview(query.data.state),
    })
  })
  router.get(
    '/api/admin/reports/:memberId',
    guard,
    async (request, response) => {
      const { memberId } = memberParams.parse(request.params)
      const page = await deps.moderation.page(memberId)
      if (page === null) {
        response.status(404).json({ error: 'not_found' })
        return
      }
      response.json(page)
    },
  )
  router.post('/api/admin/reports/dismiss', guard, dismiss(deps.moderation))

  return router
}
