import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits, LiveSettings } from '../config.js'
import type { SwipeInput, SwipeService } from '../services/swipes.js'
import { handle, notFound } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

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
  settings: Pick<LiveSettings, 'limits'>
}): Router {
  const router = Router()

  router.post(
    apiPaths.swipe,
    requirePermission(deps.auth, 'challenge:swipe'),
    handle(
      () => ({ body: swipeBody(deps.settings.limits()) }),
      async ({ body, member }, response) => {
        const outcome = await deps.swipes.swipe(member.id, body)
        if (outcome.result === 'not_found') {
          notFound(response)
          return
        }
        response.status(201).json(outcome)
      },
    ),
  )

  return router
}
