import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { NotificationSettingsService } from '../services/notification-settings.js'
import type { NotificationService } from '../services/notifications.js'
import type { SettingsService } from '../services/settings.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

const listQuery = z.object({ before: z.string().min(1).max(36).optional() })

function memberOf(locals: unknown): string {
  return (locals as GuardedLocals).member.id
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

  router.get('/api/notifications', guard, async (request, response) => {
    const { before } = listQuery.parse(request.query)
    response.json({
      notifications: await deps.notifications.list(
        memberOf(response.locals),
        before ?? null,
      ),
    })
  })

  router.get('/api/notifications/new', guard, async (_request, response) => {
    response.json({
      count: await deps.notifications.newCount(memberOf(response.locals)),
    })
  })

  router.post('/api/notifications/seen', guard, async (request, response) => {
    const { ids } = z
      .object({
        ids: z
          .array(z.string().min(1).max(36))
          .max(deps.settings.limits().notificationsPageSize),
      })
      .parse(request.body)
    await deps.notifications.seen(memberOf(response.locals), ids)
    response.status(204).end()
  })

  settingsRoutes(router, deps)
  return router
}

const choice = z.object({ cadence: z.string().min(1).max(40) })
const typeParams = z.object({ type: z.string().min(1).max(40) })
const chooseStatus = { done: 204, not_found: 404, not_offered: 400 } as const

function canReview(locals: unknown): boolean {
  return (locals as GuardedLocals).member.permissions.includes(
    'applicant:review',
  )
}

// How each type reaches the member, chosen on the profile screen (R-NOTE-2,
// R-NOTE-3). Applicant notices are offered only to who may review them.
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
          memberOf(response.locals),
          canReview(response.locals),
        ),
      })
    },
  )
  router.put(
    '/api/me/notification-settings/:type',
    guard,
    async (request, response) => {
      const { type } = typeParams.parse(request.params)
      const { cadence } = choice.parse(request.body)
      const outcome = await deps.notificationSettings.choose(
        memberOf(response.locals),
        canReview(response.locals),
        type,
        cadence,
      )
      response.status(chooseStatus[outcome]).end()
    },
  )
}
