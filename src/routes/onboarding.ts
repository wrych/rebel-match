import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import { trackNothing, type Track } from '../services/analytics.js'
import type { Limits } from '../config.js'
import type {
  OnboardingInput,
  OnboardingService,
} from '../services/onboarding.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

type TextLimits = Pick<
  Limits,
  'nameMaxChars' | 'jobTitleMaxChars' | 'orgMaxChars' | 'sectorMaxChars'
>

// A blank optional field is a field left out.
function optional(max: number): z.ZodType<string | undefined> {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value))
}

function onboardingBody(limits: TextLimits): z.ZodType<OnboardingInput> {
  return z.object({
    name: z.string().trim().min(1).max(limits.nameMaxChars),
    jobTitle: optional(limits.jobTitleMaxChars),
    org: optional(limits.orgMaxChars),
    sector: optional(limits.sectorMaxChars),
    consentVersion: z.string().min(1),
    analyticsVersion: z.string().min(1).optional(),
  })
}

/** `GET` and `POST /api/onboarding` (design §3): the form pre-filled, and its
 * submission with the consent version accepted and the analytics opt-in
 * (R-ONB-1..3, R-ANA-4). Any signed-in member may reach them, onboarded or
 * not. */
export function onboardingRoutes(deps: {
  auth: AuthProvider
  onboarding: OnboardingService
  track?: Track
  config: {
    limits: TextLimits
    consentVersion: string
    analyticsVersion: string
  }
}): Router {
  const router = Router()
  const guard = requireSession(deps.auth)
  const body = onboardingBody(deps.config.limits)
  const track = deps.track ?? trackNothing

  router.get('/api/onboarding', guard, async (_request, response) => {
    const member = (response.locals as GuardedLocals).member
    const draft = await deps.onboarding.draft(member.id)
    if (draft === null) {
      response.status(401).json({ error: 'unauthenticated' })
      return
    }
    response.json({
      ...draft,
      consentVersion: deps.config.consentVersion,
      analyticsVersion: deps.config.analyticsVersion,
    })
  })

  router.post('/api/onboarding', guard, async (request, response) => {
    const input = body.safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const member = (response.locals as GuardedLocals).member
    const outcome = await deps.onboarding.complete(member.id, input.data)
    if (outcome === 'stale_consent') {
      response.status(409).json({ result: outcome })
      return
    }
    void track(member.id, {
      name: 'onboarding_completed',
      consent_version: input.data.consentVersion,
    })
    response.status(204).end()
  })

  return router
}
