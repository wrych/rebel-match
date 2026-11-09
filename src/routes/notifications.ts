import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { NotificationSettingsService } from '../services/notification-settings.js'
import type { NotificationService } from '../services/notifications.js'
import type { SettingsService } from '../services/settings.js'
import { handle, memberOf } from './handle.js'
import { requireSession } from './require-permission.js'

// The width of notifications.id (src/db/schema.ts).
const NOTIFICATION_ID_MAX_CHARS = 36
// Room for any notification_cadence or notification_type value.
const CHOICE_MAX_CHARS = 40

const listQuery = z.object({
  before: z.string().min(1).max(NOTIFICATION_ID_MAX_CHARS).optional(),
})

function seenBody(pageSize: number): z.ZodType<{ ids: string[] }> {
  return z.object({
    ids: z
      .array(z.string().min(1).max(NOTIFICATION_ID_MAX_CHARS))
      .max(pageSize),
  })
}

/** A member's own notifications (R-NOTE-5, R-NOTE-6, design §3). Each member
 * reads and marks only their own, so a session is all these ask; the API
 * guard has already required onboarding. */
export function notificationRoutes(deps: {
  auth: AuthProvider
  notifications: NotificationService
  notificationSettings: NotificationSettingsService
  settings: Pick<SettingsService, 'limits'>
}): Router {
  const router = Router()
  const guard = requireSession(deps.auth)

  router.get(
    '/api/notifications',
    guard,
    handle({ query: listQuery }, async ({ query, member }, response) => {
      response.json({
        notifications: await deps.notifications.list(
          member.id,
          query.before ?? null,
        ),
      })
    }),
  )

  router.get('/api/notifications/new', guard, async (_request, response) => {
    response.json({
      count: await deps.notifications.newCount(memberOf(response).id),
    })
  })

  router.post(
    '/api/notifications/seen',
    guard,
    handle(
      () => ({ body: seenBody(deps.settings.limits().notificationsPageSize) }),
      async ({ body, member }, response) => {
        await deps.notifications.seen(member.id, body.ids)
        response.status(204).end()
      },
    ),
  )

  settingsRoutes(router, deps)
  return router
}

const choice = z.object({ cadence: z.string().min(1).max(CHOICE_MAX_CHARS) })
const typeParams = z.object({ type: z.string().min(1).max(CHOICE_MAX_CHARS) })
const chooseStatus = { done: 204, not_found: 404, not_offered: 400 } as const

// How each type reaches the member, chosen on the profile screen (R-NOTE-2,
// R-NOTE-3). Applicant and report notices are offered only to who may review
// them.
function settingsRoutes(
  router: Router,
  deps: {
    auth: AuthProvider
    notificationSettings: NotificationSettingsService
  },
): void {
  const guard = requireSession(deps.auth)
  router.get(
    '/api/me/notification-settings',
    guard,
    async (_request, response) => {
      response.json({
        settings: await deps.notificationSettings.list(
          memberOf(response).id,
          memberOf(response).permissions,
        ),
      })
    },
  )
  router.put(
    '/api/me/notification-settings/:type',
    guard,
    handle(
      { params: typeParams, body: choice },
      async ({ params, body, member }, response) => {
        const outcome = await deps.notificationSettings.choose(
          member.id,
          member.permissions,
          params.type,
          body.cadence,
        )
        response.status(chooseStatus[outcome]).end()
      },
    ),
  )
}
