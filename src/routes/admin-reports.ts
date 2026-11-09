import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import {
  moderationReasons,
  type ModerationReason,
} from '../services/challenge-moderation.js'
import type { ModerationService } from '../services/moderation.js'
import type { NotificationService } from '../services/notifications.js'
import { dismissStatus, hideStatus, unhideStatus } from '../outcomes.js'
import { handle, notFound, replyOutcome } from './handle.js'
import { requirePermission } from './require-permission.js'

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

const dismissBody = z.union([
  z.object({ challengeId: z.string().min(1) }).strict(),
  z.object({ requestId: z.string().min(1) }).strict(),
  z.object({ reportId: z.string().min(1) }).strict(),
])

function dismiss(moderation: ModerationService): RequestHandler {
  return handle({ body: dismissBody }, async ({ body, member }, response) => {
    const outcome = await moderation.dismiss(body, member.id)
    replyOutcome(response, dismissStatus, outcome)
  })
}

function hideNote(moderation: ModerationService): RequestHandler {
  return handle(
    { params: requestParams, body: hideBody },
    async ({ params, body, member }, response) => {
      const outcome = await moderation.hideNote(
        params.id,
        member.id,
        body.reason,
      )
      replyOutcome(response, hideStatus, outcome)
    },
  )
}

function unhideNote(moderation: ModerationService): RequestHandler {
  return handle(
    { params: requestParams },
    async ({ params, member }, response) => {
      const outcome = await moderation.unhideNote(params.id, member.id)
      replyOutcome(response, unhideStatus, outcome)
    },
  )
}

function memberPage(
  moderation: ModerationService,
  notifications: Pick<NotificationService, 'openedReports'>,
): RequestHandler {
  return handle(
    { params: memberParams },
    async ({ params, member }, response) => {
      const page = await moderation.page(params.memberId)
      if (page === null) {
        notFound(response)
        return
      }
      // Opening the page is what its notices lead to, so they are seen
      // (R-NOTE-5).
      await notifications.openedReports(member.id, params.memberId)
      response.json(page)
    },
  )
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

  router.get(
    '/api/admin/reports',
    guard,
    handle({ query: stateQuery }, async ({ query }, response) => {
      response.json({ members: await deps.moderation.overview(query.state) })
    }),
  )
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
