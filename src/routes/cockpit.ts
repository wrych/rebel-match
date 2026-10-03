import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Cockpit } from '../services/cockpit.js'
import type { FollowService } from '../services/follows.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

const trendParams = z.object({ trendId: z.string().min(1) })

function memberOf(locals: unknown): string {
  return (locals as GuardedLocals).member.id
}

/** `GET /api/cockpit` and the follow routes (design §3, F8, F9). Every member
 * has these for themselves, so a session is all they ask; the API guard has
 * already required onboarding. */
export function cockpitRoutes(deps: {
  auth: AuthProvider
  follows: FollowService
  cockpit: { cockpit(memberId: string): Promise<Cockpit> }
}): Router {
  const router = Router()
  const guard = requireSession(deps.auth)

  router.get('/api/cockpit', guard, async (_request, response) => {
    response.json(await deps.cockpit.cockpit(memberOf(response.locals)))
  })
  router.get('/api/follows', guard, async (_request, response) => {
    response.json({
      trends: await deps.follows.followed(memberOf(response.locals)),
    })
  })
  router.post('/api/follows/:trendId', guard, async (request, response) => {
    const { trendId } = trendParams.parse(request.params)
    const outcome = await deps.follows.follow(
      memberOf(response.locals),
      trendId,
    )
    response.status(outcome === 'followed' ? 204 : 404).end()
  })
  router.delete('/api/follows/:trendId', guard, async (request, response) => {
    const { trendId } = trendParams.parse(request.params)
    await deps.follows.unfollow(memberOf(response.locals), trendId)
    response.status(204).end()
  })

  return router
}
