import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
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

  return router
}
