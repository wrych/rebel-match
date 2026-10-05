import { Router } from 'express'
import { z } from 'zod'
import { EMAIL_MAX } from '../db/schema.js'
import type { Limits } from '../config.js'
import type { AdmissionService } from '../services/admission.js'
import { PAYLOAD_MAX_CHARS } from '../services/human-check.js'
import { clientIp } from './ip-limit.js'

const requestBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(EMAIL_MAX)),
  next: z.string().optional(),
  invite: z.string().min(1).optional(),
  altcha: z.string().min(1).max(PAYLOAD_MAX_CHARS).optional(),
})

function applicantBody(
  limits: Pick<Limits, 'nameMaxChars' | 'orgMaxChars'>,
): z.ZodType<{
  handle: string
  name?: string | undefined
  org?: string | undefined
}> {
  return z.object({
    handle: z.string().min(1),
    name: z.string().trim().max(limits.nameMaxChars).optional(),
    org: z.string().trim().max(limits.orgMaxChars).optional(),
  })
}

/** A blank field is a field left out, so it never overwrites an earlier one. */
function given(text: string | undefined): string | undefined {
  return text === '' ? undefined : text
}

/** `POST /auth/request-link` tells the login screen what comes next, each
 * state truthfully (ADR 0013, R-AUTH-13); `POST /auth/applicant` lets the
 * applicant say who they are, for the host (R-AUTH-11,12). */
export function requestLinkRoutes(deps: {
  admission: AdmissionService
  config: { limits: Limits }
}): Router {
  const router = Router()
  const describeBody = applicantBody(deps.config.limits)

  router.post('/auth/request-link', async (request, response) => {
    const body = requestBody.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const answer = await deps.admission.requestLink(body.data.email, {
      next: body.data.next,
      invite: body.data.invite,
      client: { ip: clientIp(request), altcha: body.data.altcha },
    })
    if (answer.state === 'try-later') {
      response.status(429).json({ error: 'too_many_requests' })
      return
    }
    response.json(answer)
  })

  router.post('/auth/applicant', async (request, response) => {
    const body = describeBody.safeParse(request.body)
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
