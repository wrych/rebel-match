import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type {
  AnalyticsChoice,
  AnalyticsConsentService,
} from '../services/analytics-consent.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

const choiceBody: z.ZodType<AnalyticsChoice> = z.discriminatedUnion('optIn', [
  z.object({
    optIn: z.literal(true),
    version: z.string().min(1),
    from: z.literal('onboarding').optional(),
  }),
  z.object({
    optIn: z.literal(false),
    from: z.literal('onboarding').optional(),
  }),
])

/** `PUT /api/me/analytics` (design §3): give or withdraw the analytics opt-in,
 * from the usage step of onboarding or the profile screen (R-ANA-4, ADR 0041). */
export function analyticsConsentRoutes(deps: {
  auth: AuthProvider
  analyticsConsent: AnalyticsConsentService
}): Router {
  const router = Router()

  router.put(
    '/api/me/analytics',
    requireSession(deps.auth),
    async (request, response) => {
      const choice = choiceBody.safeParse(request.body)
      if (!choice.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const member = (response.locals as GuardedLocals).member
      const outcome = await deps.analyticsConsent.choose(member.id, choice.data)
      if (outcome === 'stale') {
        response.status(409).json({ result: 'stale_analytics' })
        return
      }
      response.status(204).end()
    },
  )

  return router
}
