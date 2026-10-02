import { Router } from 'express'
import { z } from 'zod'
import type { AdmissionService } from '../services/admission.js'

// The widths of members.requested_name and requested_org (migration 001), so
// an applicant's words are refused here rather than truncated by the database.
const REQUESTED_NAME_MAX = 120
const REQUESTED_ORG_MAX = 160

const requestBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  next: z.string().optional(),
})

const applicantBody = z.object({
  handle: z.string().min(1),
  name: z.string().trim().max(REQUESTED_NAME_MAX).optional(),
  org: z.string().trim().max(REQUESTED_ORG_MAX).optional(),
})

/** A blank field is a field left out, so it never overwrites an earlier one. */
function given(text: string | undefined): string | undefined {
  return text === '' ? undefined : text
}

/** `POST /auth/request-link` and `POST /auth/applicant` (design §3): the first
 * answers what the login screen says next — check your email, access
 * requested, or not approved — each told truthfully and differently (ADR 0013,
 * R-AUTH-13). The second lets the applicant say who they are, for the host
 * (R-AUTH-11,12). */
export function requestLinkRoutes(deps: {
  admission: AdmissionService
}): Router {
  const router = Router()

  router.post('/auth/request-link', async (request, response) => {
    const body = requestBody.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    response.json(
      await deps.admission.requestLink(body.data.email, body.data.next),
    )
  })

  router.post('/auth/applicant', async (request, response) => {
    const body = applicantBody.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const { handle, name, org } = body.data
    const outcome = await deps.admission.describeApplicant(handle, {
      name: given(name),
      org: given(org),
    })
    if (outcome === 'not-found') {
      response.status(404).json({ error: 'not_found' })
      return
    }
    response.status(204).end()
  })

  return router
}
