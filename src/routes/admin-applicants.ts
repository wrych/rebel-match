import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { ApprovalService } from '../services/approvals.js'
import type { NotificationService } from '../services/notifications.js'
import { handle, memberOf, replyOutcome } from './handle.js'
import { requirePermission } from './require-permission.js'

const applicantParams = z.object({ id: z.string().min(1) })

const approveStatus = {
  approved: 204,
  not_pending: 404,
  link_failed: 502,
} as const
const rejectStatus = { rejected: 204, not_pending: 404 } as const

/** F10 (design §3): list, approve and reject applicants, behind
 * `applicant:review` (R-AUTH-3, R-AUTH-11). */
export function adminApplicantRoutes(deps: {
  auth: AuthProvider
  approvals: ApprovalService
  notifications: Pick<NotificationService, 'openedApplicants'>
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'applicant:review')

  router.get('/api/admin/applicants', guard, async (_request, response) => {
    const applicants = await deps.approvals.listPending()
    await deps.notifications.openedApplicants(memberOf(response).id)
    response.json({ applicants })
  })

  router.post(
    '/api/admin/applicants/:id/approve',
    guard,
    handle(
      { params: applicantParams },
      async ({ params, member }, response) => {
        const outcome = await deps.approvals.approve(params.id, member.id)
        replyOutcome(response, approveStatus, outcome)
      },
    ),
  )

  router.post(
    '/api/admin/applicants/:id/reject',
    guard,
    handle({ params: applicantParams }, async ({ params }, response) => {
      replyOutcome(
        response,
        rejectStatus,
        await deps.approvals.reject(params.id),
      )
    }),
  )

  return router
}
