import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { ActivityService } from '../services/activity.js'
import { inviteToken } from './invite-token.js'
import { handle, memberOf, notFound } from './handle.js'
import { requirePermission, requireSession } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

const seenBody = z.object({ challengeId: z.string().min(1) })
const openedBody = z.object({ invite: inviteToken })

/** `POST /api/deck/seen`, `POST /auth/invite-opened` and
 * `DELETE /api/me/history` (design §3). None answers with a record: activity
 * is recorded, never read back (R-STAT-2). */
export function activityRoutes(deps: {
  auth: AuthProvider
  activity: ActivityService
}): Router {
  const router = Router()

  router.post(
    apiPaths.deckSeen,
    requirePermission(deps.auth, 'challenge:swipe'),
    handle({ body: seenBody }, async ({ body, member }, response) => {
      const outcome = await deps.activity.viewed(member.id, body.challengeId)
      if (outcome === 'not_found') {
        notFound(response)
        return
      }
      response.status(204).end()
    }),
  )

  // No session: the visitor has just scanned a code. Every well-formed body
  // gets the same answer, so it says nothing about which tokens exist.
  router.post(apiPaths.inviteOpened, async (request, response) => {
    const body = openedBody.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    await deps.activity.inviteOpened(body.data.invite)
    response.status(204).end()
  })

  router.delete(
    apiPaths.history,
    requireSession(deps.auth),
    async (_request, response) => {
      await deps.activity.forgetHistory(memberOf(response).id)
      response.status(204).end()
    },
  )

  return router
}
