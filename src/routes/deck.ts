import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { DeckService } from '../services/deck.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

// The width of challenges.id (src/db/schema.ts).
const CHALLENGE_ID_MAX_CHARS = 36

// The card to open the deck at, as a notification links it (R-OFF-7).
const deckQuery = z.object({
  first: z.string().min(1).max(CHALLENGE_ID_MAX_CHARS).optional(),
})

/** `GET /api/deck` (design §3): the next cards to swipe, behind
 * `challenge:swipe` (R-OFF-1), optionally opened at one (R-OFF-7). */
export function deckRoutes(deps: {
  auth: AuthProvider
  deck: DeckService
}): Router {
  const router = Router()

  router.get(
    '/api/deck',
    requirePermission(deps.auth, 'challenge:swipe'),
    async (request, response) => {
      const viewer = (response.locals as GuardedLocals).member
      const { first } = deckQuery.parse(request.query)
      response.json({ cards: await deps.deck.next(viewer.id, first) })
    },
  )

  return router
}
