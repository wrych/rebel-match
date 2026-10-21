import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import {
  moderationReasons,
  type ModerationReason,
} from '../services/challenge-moderation.js'
import type { ModerationService } from '../services/moderation.js'
import type { NotificationService } from '../services/notifications.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

const stateQuery = z.object({
  state: z.enum(['open', 'handled']).default('open'),
})
const memberParams = z.object({ memberId: z.string().min(1) })
const requestParams = z.object({ id: z.string().min(1) })
const hideBody = z.object({
  reason: z.enum(
    moderationReasons as [ModerationReason, ...ModerationReason[]],
  ),
})
const hideStatus = { hidden: 204, not_found: 404 } as const
const unhideStatus = { shown: 204, not_found: 404 } as const

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

function hideNote(moderation: ModerationService): RequestHandler {
  return async (request, response) => {
    const { id } = requestParams.parse(request.params)
    const input = hideBody.safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const host = (response.locals as GuardedLocals).member.id
    const outcome = await moderation.hideNote(id, host, input.data.reason)
    response.status(hideStatus[outcome]).json({ result: outcome })
  }
}

function unhideNote(moderation: ModerationService): RequestHandler {
  return async (request, response) => {
    const { id } = requestParams.parse(request.params)
    const host = (response.locals as GuardedLocals).member.id
    const outcome = await moderation.unhideNote(id, host)
    response.status(unhideStatus[outcome]).json({ result: outcome })
  }
}

function memberPage(
  moderation: ModerationService,
  notifications: Pick<NotificationService, 'openedReports'>,
): RequestHandler {
  return async (request, response) => {
    const { memberId } = memberParams.parse(request.params)
    const page = await moderation.page(memberId)
    if (page === null) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    // Opening the page is what its notices lead to, so they are seen
    // (R-NOTE-5).
    await notifications.openedReports(
      (response.locals as GuardedLocals).member.id,
      memberId,
    )
    response.json(page)
  }
}

/** F21's API (design §3): reported members, one member's reports and the
 * history of what hosts did, and dismissing an item's reports, behind
 * `report:review`; hiding a note, behind `challenge:moderate` like hiding a
 * challenge (R-MOD-6..8, R-MOD-12). */
export function adminReportRoutes(deps: {
  auth: AuthProvider
  moderation: ModerationService
  notifications: Pick<NotificationService, 'openedReports'>
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
  // The menu's Moderation count (R-MOD-5); before the member's page, whose
  // path would take it.
  router.get('/api/admin/reports/count', guard, async (_request, response) => {
    response.json({ members: await deps.moderation.openMembers() })
  })
  router.get(
    '/api/admin/reports/:memberId',
    guard,
    memberPage(deps.moderation, deps.notifications),
  )
  router.post('/api/admin/reports/dismiss', guard, dismiss(deps.moderation))
  const hides = requirePermission(deps.auth, 'challenge:moderate')
  router.post(
    '/api/admin/requests/:id/hide-note',
    hides,
    hideNote(deps.moderation),
  )
  router.post(
    '/api/admin/requests/:id/unhide-note',
    hides,
    unhideNote(deps.moderation),
  )

  return router
}
