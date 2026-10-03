import { Router } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { DeckService } from '../services/deck.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

/** `GET /api/deck` (design §3): the next cards to swipe, behind
 * `challenge:swipe` (R-OFF-1). */
export function deckRoutes(deps: {
  auth: AuthProvider
  deck: DeckService
}): Router {
  const router = Router()

  router.get(
    '/api/deck',
    requirePermission(deps.auth, 'challenge:swipe'),
    async (_request, response) => {
      const viewer = (response.locals as GuardedLocals).member
      response.json({ cards: await deps.deck.next(viewer.id) })
    },
  )

  return router
}
