import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import { seenRows } from '../badges/rows.js'
import type { LiveSettings } from '../config.js'
import type { BadgeService } from '../services/badges.js'
import { inviteToken } from './invite-token.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

const seenBody = z.object({
  rows: z.array(z.enum(seenRows)).max(seenRows.length),
})
const claimBody = z.object({ invite: inviteToken })

const memberOf = (locals: unknown): string =>
  (locals as GuardedLocals).member.id

// While hosts have badges off, their addresses are as absent as ones that
// never existed (R-BADGE-15, R-NAV-8).
function whileOn(settings: Pick<LiveSettings, 'limits'>): RequestHandler {
  return (_request, response, next) => {
    if (settings.limits().badges === 1) {
      next()
      return
    }
    response.status(404).json({ error: 'not_found' })
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

  router.get('/api/badges', shown, guard, async (_request, response) => {
    response.json(await deps.badges.mine(memberOf(response.locals)))
  })

  router.get('/api/badges/new', shown, guard, async (_request, response) => {
    response.json({
      count: await deps.badges.newCount(memberOf(response.locals)),
    })
  })

  router.post('/api/badges/seen', shown, guard, async (request, response) => {
    const body = seenBody.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    await deps.badges.seen(memberOf(response.locals), body.data.rows)
    response.status(204).end()
  })

  // The same answer whatever the invite, so a member learns nothing of one
  // that is not valid (R-BADGE-6, R-INV-5).
  router.post('/api/badges/claim', guard, async (request, response) => {
    const body = claimBody.safeParse(request.body)
    if (body.success)
      await deps.badges.claim(memberOf(response.locals), body.data.invite)
    response.status(204).end()
  })

  return router
}
