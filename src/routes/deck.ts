import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { DeckService } from '../services/deck.js'
import { handle } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

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
    apiPaths.deck,
    requirePermission(deps.auth, 'challenge:swipe'),
    handle({ query: deckQuery }, async ({ query, member }, response) => {
      response.json({ cards: await deps.deck.next(member.id, query.first) })
    }),
  )

  return router
}
