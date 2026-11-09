import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import {
  moderationReasons,
  type ChallengeModeration,
  type ModerationReason,
} from '../services/challenge-moderation.js'
import { hideStatus, unhideStatus } from '../outcomes.js'
import { handle, replyFound, replyOutcome } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

const idParams = z.object({ id: z.string().min(1) })
const hideBody = z.object({
  reason: z.enum(
    moderationReasons as [ModerationReason, ...ModerationReason[]],
  ),
})

function hide(moderation: ChallengeModeration): RequestHandler {
  return handle(
    { params: idParams, body: hideBody },
    async ({ params, body, member }, response) => {
      const outcome = await moderation.hide(params.id, member.id, body.reason)
      replyOutcome(response, hideStatus, outcome)
    },
  )
}

function unhide(moderation: ChallengeModeration): RequestHandler {
  return handle({ params: idParams }, async ({ params, member }, response) => {
    const outcome = await moderation.unhide(params.id, member.id)
    replyOutcome(response, unhideStatus, outcome)
  })
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
    apiPaths.memberChallenges,
    guard,
    handle({ params: idParams }, async ({ params }, response) => {
      const challenges = await deps.challengeModeration.ofMember(params.id)
      replyFound(response, challenges, 'challenges')
    }),
  )
  router.post(apiPaths.hideChallenge, guard, hide(deps.challengeModeration))
  router.post(apiPaths.unhideChallenge, guard, unhide(deps.challengeModeration))

  return router
}
