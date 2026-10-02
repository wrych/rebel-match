import { Router } from 'express'
import { z } from 'zod'
import type { AdmissionService } from '../services/admission.js'

const requestBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  next: z.string().optional(),
})

/** `POST /auth/request-link` (design §3): answers which screen comes next,
 * "check your email" or "access requested" — deliberately different (ADR 0013). */
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
    const state = await deps.admission.requestLink(
      body.data.email,
      body.data.next,
    )
    response.json({ state })
  })

  return router
}
