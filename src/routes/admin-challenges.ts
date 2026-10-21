import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import {
  moderationReasons,
  type ChallengeModeration,
  type ModerationReason,
} from '../services/challenge-moderation.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

const idParams = z.object({ id: z.string().min(1) })
const hideBody = z.object({
  reason: z.enum(
    moderationReasons as [ModerationReason, ...ModerationReason[]],
  ),
})

const hideStatus = { hidden: 204, not_found: 404 } as const
const unhideStatus = { shown: 204, not_found: 404 } as const

function hide(moderation: ChallengeModeration): RequestHandler {
  return async (request, response) => {
    const params = idParams.parse(request.params)
    const input = hideBody.safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const host = (response.locals as GuardedLocals).member.id
    const outcome = await moderation.hide(params.id, host, input.data.reason)
    response.status(hideStatus[outcome]).json({ result: outcome })
  }
}

function unhide(moderation: ChallengeModeration): RequestHandler {
  return async (request, response) => {
    const params = idParams.parse(request.params)
    const outcome = await moderation.unhide(params.id)
    response.status(unhideStatus[outcome]).json({ result: outcome })
  }
}

/** A member's challenges on their page, and hiding or showing one (R-MOD-8,
 * R-MEM-2, design §3), behind `challenge:moderate`. */
export function adminChallengeRoutes(deps: {
  auth: AuthProvider
  challengeModeration: ChallengeModeration
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'challenge:moderate')

  router.get(
    '/api/admin/members/:id/challenges',
    guard,
    async (request, response) => {
      const params = idParams.parse(request.params)
      const challenges = await deps.challengeModeration.ofMember(params.id)
      if (challenges === null) {
        response.status(404).json({ error: 'not_found' })
        return
      }
      response.json({ challenges })
    },
  )
  router.post(
    '/api/admin/challenges/:id/hide',
    guard,
    hide(deps.challengeModeration),
  )
  router.post(
    '/api/admin/challenges/:id/unhide',
    guard,
    unhide(deps.challengeModeration),
  )

  return router
}
