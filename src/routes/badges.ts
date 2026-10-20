import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import { badgeRows } from '../badges/rows.js'
import type { BadgeService } from '../services/badges.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

const seenBody = z.object({
  rows: z.array(z.enum(badgeRows)).max(badgeRows.length),
})

const memberOf = (locals: unknown): string =>
  (locals as GuardedLocals).member.id

/** A member's own badges (R-BADGE-7, R-BADGE-10, R-BADGE-12, design §3). Each
 * member reads and marks only their own, so a session is all these ask; the
 * API guard has already required onboarding. */
export function badgeRoutes(deps: {
  auth: AuthProvider
  badges: BadgeService
}): Router {
  const router = Router()
  const guard = requireSession(deps.auth)

  router.get('/api/badges', guard, async (_request, response) => {
    response.json(await deps.badges.mine(memberOf(response.locals)))
  })

  router.get('/api/badges/new', guard, async (_request, response) => {
    response.json({
      count: await deps.badges.newCount(memberOf(response.locals)),
    })
  })

  router.post('/api/badges/seen', guard, async (request, response) => {
    const body = seenBody.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    await deps.badges.seen(memberOf(response.locals), body.data.rows)
    response.status(204).end()
  })

  return router
}
