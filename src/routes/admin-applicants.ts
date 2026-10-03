import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { ApprovalService } from '../services/approvals.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

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
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'applicant:review')

  router.get('/api/admin/applicants', guard, async (_request, response) => {
    response.json({ applicants: await deps.approvals.listPending() })
  })

  router.post(
    '/api/admin/applicants/:id/approve',
    guard,
    async (request, response) => {
      const params = applicantParams.safeParse(request.params)
      if (!params.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const actor = (response.locals as GuardedLocals).member
      const outcome = await deps.approvals.approve(params.data.id, actor.id)
      response.status(approveStatus[outcome]).json({ result: outcome })
    },
  )

  router.post(
    '/api/admin/applicants/:id/reject',
    guard,
    async (request, response) => {
      const params = applicantParams.safeParse(request.params)
      if (!params.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const outcome = await deps.approvals.reject(params.data.id)
      response.status(rejectStatus[outcome]).json({ result: outcome })
    },
  )

  return router
}
