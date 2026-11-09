import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import { routeTable } from '../routes.js'
import type {
  FeedbackNote,
  FeedbackSender,
  FeedbackService,
} from '../services/feedback.js'
import { PAYLOAD_MAX_CHARS } from '../services/human-check.js'
import { clientIp } from './ip-limit.js'
import { apiPaths } from '../api-paths.js'

const screens: readonly string[] = [
  ...routeTable.map((route) => route.name),
  'not-found',
]

const optional = (max: number): z.ZodType<string | undefined> =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((text) => (text === '' ? undefined : text))

function feedbackBody(
  limits: Pick<Limits, 'feedbackMaxChars' | 'nameMaxChars' | 'emailMaxChars'>,
): z.ZodType<FeedbackNote & { altcha?: string | undefined }> {
  return z.object({
    message: z.string().trim().min(1).max(limits.feedbackMaxChars),
    name: optional(limits.nameMaxChars),
    email: optional(limits.emailMaxChars).pipe(z.email().optional()),
    screen: z
      .string()
      .refine((name) => screens.includes(name))
      .optional(),
    altcha: z.string().min(1).max(PAYLOAD_MAX_CHARS).optional(),
  })
}

/** `POST /api/feedback`: public, so anyone can tell the team what they think
 * (R-FB-1); a visitor answers a human check, and both are paced (R-FB-2). */
export function feedbackRoutes(deps: {
  auth: AuthProvider
  feedback: FeedbackService
  config: { limits: Limits }
}): Router {
  const router = Router()
  const body = feedbackBody(deps.config.limits)

  router.post(apiPaths.feedback, async (request, response) => {
    const parsed = body.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const { altcha, ...note } = parsed.data
    const member = await deps.auth.currentMember(request)
    const from: FeedbackSender =
      member === null
        ? { ip: clientIp(request), altcha }
        : { memberId: member.id }
    const outcome = await deps.feedback.send(note, from)
    if (outcome.result === 'sent') response.status(204).end()
    else if (outcome.result === 'human-check')
      response.json({ state: 'human-check', challenge: outcome.challenge })
    else if (outcome.result === 'try-later')
      response.status(429).json({ error: 'too_many_requests' })
    else response.status(503).json({ error: 'not_sent' })
  })

  return router
}
