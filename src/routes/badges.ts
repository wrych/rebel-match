import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import { seenRows } from '../badges/rows.js'
import type { LiveSettings } from '../config.js'
import type { BadgeService } from '../services/badges.js'
import { inviteToken } from './invite-token.js'
import { handle, memberOf, notFound } from './handle.js'
import { requireSession } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

const seenBody = z.object({
  rows: z.array(z.enum(seenRows)).max(seenRows.length),
})
const claimBody = z.object({ invite: inviteToken })

// While hosts have badges off, their addresses are as absent as ones that
// never existed (R-BADGE-15, R-NAV-8).
function whileOn(settings: Pick<LiveSettings, 'limits'>): RequestHandler {
  return (_request, response, next) => {
    if (settings.limits().badges === 1) {
      next()
      return
    }
    notFound(response)
  }
}

/** A member's own badges (R-BADGE-7, R-BADGE-10, R-BADGE-12, design §3). Each
 * member reads and marks only their own, so a session is all these ask; the
 * API guard has already required onboarding. */
export function badgeRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'limits'>
  badges: BadgeService
}): Router {
  const router = Router()
  const guard = requireSession(deps.auth)
  const shown = whileOn(deps.settings)

  router.get(apiPaths.badges, shown, guard, async (_request, response) => {
    response.json(await deps.badges.mine(memberOf(response).id))
  })

  router.get(apiPaths.newBadges, shown, guard, async (_request, response) => {
    response.json({
      count: await deps.badges.newCount(memberOf(response).id),
    })
  })

  router.post(
    apiPaths.badgesSeen,
    shown,
    guard,
    handle({ body: seenBody }, async ({ body, member }, response) => {
      await deps.badges.seen(member.id, body.rows)
      response.status(204).end()
    }),
  )

  // The same answer whatever the invite, so a member learns nothing of one
  // that is not valid (R-BADGE-6, R-INV-5).
  router.post(apiPaths.claimBadge, guard, async (request, response) => {
    const body = claimBody.safeParse(request.body)
    if (body.success)
      await deps.badges.claim(memberOf(response).id, body.data.invite)
    response.status(204).end()
  })

  return router
}
