import { randomUUID } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import {
  moderationReasons,
  type ModerationReason,
} from '../services/challenge-moderation.js'
import type { ReportItem, ReportService } from '../services/reports.js'
import { handle, replyFound, replyOutcome } from './handle.js'
import { requirePermission } from './require-permission.js'

const idParams = z.object({ id: z.string().min(1) })
const reason = z.enum(
  moderationReasons as [ModerationReason, ...ModerationReason[]],
)

const reportStatus = {
  reported: 204,
  not_found: 404,
  already_reported: 409,
  too_many: 429,
} as const

type Deps = {
  auth: AuthProvider
  reports: ReportService
  settings: Pick<LiveSettings, 'limits'>
}

// One item, a known reason, and a comment that may be left empty.
function reportBody(maxChars: number): z.ZodType<{
  item: ReportItem
  reason: ModerationReason
  comment: string | null
}> {
  const comment = z
    .string()
    .trim()
    .max(maxChars)
    .optional()
    .transform((text) => (text === undefined || text === '' ? null : text))
  return z
    .union([
      z.object({ challengeId: z.string().min(1), reason, comment }).strict(),
      z.object({ requestId: z.string().min(1), reason, comment }).strict(),
    ])
    .transform((body) => ({
      item:
        'challengeId' in body
          ? { challengeId: body.challengeId }
          : { requestId: body.requestId },
      reason: body.reason,
      comment: body.comment,
    }))
}

function target(
  deps: Deps,
  itemOf: (id: string) => ReportItem,
): RequestHandler {
  return handle({ params: idParams }, async ({ params, member }, response) => {
    const found = await deps.reports.target(member.id, itemOf(params.id))
    replyFound(response, found, 'target')
  })
}

function report(deps: Deps): RequestHandler {
  return handle(
    () => ({ body: reportBody(deps.settings.limits().reportCommentMaxChars) }),
    async ({ body, member }, response) => {
      const outcome = await deps.reports.report(member.id, body, randomUUID)
      replyOutcome(response, reportStatus, outcome)
    },
  )
}

/** F20's API (design §3): what the report screen shows, and the report
 * itself, behind `content:report` (R-MOD-1..4). */
export function reportRoutes(deps: Deps): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'content:report')

  router.get(
    '/api/reports/challenge/:id',
    guard,
    target(deps, (challengeId) => ({ challengeId })),
  )
  router.get(
    '/api/reports/request/:id',
    guard,
    target(deps, (requestId) => ({ requestId })),
  )
  router.post('/api/reports', guard, report(deps))

  return router
}
