import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type { OutboxFilter, OutboxLog } from '../services/outbox-log.js'
import { requirePermission } from './require-permission.js'

function listQuery(pageSize: number): z.ZodType<OutboxFilter> {
  return z.object({
    to: z.string().min(1).optional(),
    status: z.enum(['recorded', 'sent', 'suppressed', 'failed']).optional(),
    limit: z.coerce.number().int().positive().max(pageSize).default(pageSize),
  })
}

/** `GET /api/admin/outbox`: the outbound message log, newest first, filtered by
 * recipient and status, behind `outbox:read` in every environment (R-MSG-5). */
export function adminOutboxRoutes(deps: {
  auth: AuthProvider
  outbox: Pick<OutboxLog, 'list'>
  config: { limits: Pick<Limits, 'outboxPageSize'> }
}): Router {
  const router = Router()
  const query = listQuery(deps.config.limits.outboxPageSize)

  router.get(
    '/api/admin/outbox',
    requirePermission(deps.auth, 'outbox:read'),
    async (request, response) => {
      const filter = query.safeParse(request.query)
      if (!filter.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      response.json({ entries: await deps.outbox.list(filter.data) })
    },
  )

  return router
}
