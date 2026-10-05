import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { ActivityService } from '../services/activity.js'
import {
  requirePermission,
  requireSession,
  type GuardedLocals,
} from './require-permission.js'

const seenBody = z.object({ challengeId: z.string().min(1) })

/** `POST /api/deck/seen` and `DELETE /api/me/history` (design §3). Neither
 * answers with a record: views are recorded, never read back (R-STAT-2). */
export function activityRoutes(deps: {
  auth: AuthProvider
  activity: ActivityService
}): Router {
  const router = Router()

  router.post(
    '/api/deck/seen',
    requirePermission(deps.auth, 'challenge:swipe'),
    async (request, response) => {
      const body = seenBody.safeParse(request.body)
      if (!body.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const member = (response.locals as GuardedLocals).member
      const outcome = await deps.activity.viewed(
        member.id,
        body.data.challengeId,
      )
      if (outcome === 'not_found') {
        response.status(404).json({ error: 'not_found' })
        return
      }
      response.status(204).end()
    },
  )

  router.delete(
    '/api/me/history',
    requireSession(deps.auth),
    async (_request, response) => {
      const member = (response.locals as GuardedLocals).member
      await deps.activity.forgetHistory(member.id)
      response.status(204).end()
    },
  )

  return router
}
