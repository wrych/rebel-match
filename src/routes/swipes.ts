import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type { SwipeInput, SwipeService } from '../services/swipes.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

type NoteLimits = Pick<
  Limits,
  'beenThereNoteMinChars' | 'connectionMessageMaxChars'
>

// Been there needs a substantive note (R-OFF-4); the other answers carry none.
function swipeBody(limits: NoteLimits): z.ZodType<SwipeInput> {
  const note = z.string().trim().max(limits.connectionMessageMaxChars)
  return z.discriminatedUnion('action', [
    z.object({
      challengeId: z.string().min(1),
      action: z.literal('been_there'),
      note: note.min(limits.beenThereNoteMinChars),
    }),
    z.object({
      challengeId: z.string().min(1),
      action: z.enum(['same_boat', 'follow', 'skip']),
    }),
  ])
}

/** `POST /api/swipe` (design §3, F6), behind `challenge:swipe`. */
export function swipeRoutes(deps: {
  auth: AuthProvider
  swipes: SwipeService
  config: { limits: NoteLimits }
}): Router {
  const router = Router()
  const body = swipeBody(deps.config.limits)

  router.post(
    '/api/swipe',
    requirePermission(deps.auth, 'challenge:swipe'),
    async (request, response) => {
      const input = body.safeParse(request.body)
      if (!input.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const viewer = (response.locals as GuardedLocals).member
      const outcome = await deps.swipes.swipe(viewer.id, input.data)
      if (outcome.result === 'not_found') {
        response.status(404).json({ error: 'not_found' })
        return
      }
      response.status(201).json(outcome)
    },
  )

  return router
}
