import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { CockpitService } from '../services/cockpit.js'
import type { FollowService } from '../services/follows.js'
import { handle, memberOf } from './handle.js'
import { requireSession } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

const trendParams = z.object({ trendId: z.string().min(1) })

/** `GET /api/cockpit`, `POST /api/matches/seen` and the follow routes
 * (design §3, F8, F9). Every member
 * has these for themselves, so a session is all they ask; the API guard has
 * already required onboarding. */
export function cockpitRoutes(deps: {
  auth: AuthProvider
  follows: FollowService
  cockpit: CockpitService
}): Router {
  const router = Router()
  const guard = requireSession(deps.auth)

  router.get(apiPaths.cockpit, guard, async (_request, response) => {
    response.json(await deps.cockpit.cockpit(memberOf(response).id))
  })
  router.post(apiPaths.matchesSeen, guard, async (_request, response) => {
    await deps.cockpit.seen(memberOf(response).id)
    response.status(204).end()
  })
  router.get(apiPaths.follows, guard, async (_request, response) => {
    response.json({
      trends: await deps.follows.followed(memberOf(response).id),
    })
  })
  router.post(
    apiPaths.follow,
    guard,
    handle({ params: trendParams }, async ({ params, member }, response) => {
      const outcome = await deps.follows.follow(member.id, params.trendId)
      response.status(outcome === 'followed' ? 204 : 404).end()
    }),
  )
  router.delete(
    apiPaths.follow,
    guard,
    handle({ params: trendParams }, async ({ params, member }, response) => {
      await deps.follows.unfollow(member.id, params.trendId)
      response.status(204).end()
    }),
  )

  return router
}
