import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Config, LiveSettings } from '../config.js'
import type { GameService } from '../services/game.js'
import { gameHints } from '../services/game.js'
import { createWindowCounter } from '../services/rate-limit.js'
import { handle, memberOf, notFound } from './handle.js'
import { requirePermission } from './require-permission.js'

const RECORD_WINDOW_MINUTES = 1

const dayBody = z.object({
  level: z.number().int(),
  outcome: z.enum(['won', 'lost', 'abandoned']),
  playSeconds: z.number().int(),
})
const sharingBody = z.object({ shared: z.boolean() })
const hintParams = z.object({ hint: z.enum(gameHints) })

type Deps = {
  auth: AuthProvider
  settings: LiveSettings
  game: GameService
  config: Pick<Config, 'gameRecordsPerMinute' | 'gameLeaderboardSize'>
}

// While hosts have the game off, every game address is as absent as one that
// never existed (R-GAME-1, R-GAME-17).
function whileOn(settings: LiveSettings): RequestHandler {
  return (_request, response, next) => {
    if (settings.game().enabled === 1) {
      next()
      return
    }
    notFound(response)
  }
}

function recordDay(deps: Deps): RequestHandler {
  const counter = createWindowCounter({
    windowMinutes: () => RECORD_WINDOW_MINUTES,
  })
  return handle({ body: dayBody }, async ({ body, member }, response) => {
    if (!counter.take(member.id, deps.config.gameRecordsPerMinute)) {
      response.status(429).json({ error: 'too_many_requests' })
      return
    }
    const result = await deps.game.recordDay(member.id, body)
    if (result === 'implausible') {
      response.status(422).json({ error: 'implausible' })
      return
    }
    response.json(result)
  })
}

/** `/api/game*` (design §3, 9toRevolution): the player's state, day records,
 * the leaderboard, sharing and hints, behind the game's switch and
 * `game:play`. */
export function gameRoutes(deps: Deps): Router {
  const router = Router()
  const guard = [
    whileOn(deps.settings),
    requirePermission(deps.auth, 'game:play'),
  ]

  router.get('/api/game/door', ...guard, (_request, response) => {
    response.status(204).end()
  })
  router.get('/api/game', ...guard, async (_request, response) => {
    response.json(await deps.game.state(memberOf(response).id))
  })
  router.post('/api/game/days', ...guard, recordDay(deps))
  router.get('/api/game/leaderboard', ...guard, async (_request, response) => {
    response.json(
      await deps.game.leaderboard(
        memberOf(response).id,
        deps.config.gameLeaderboardSize,
      ),
    )
  })
  router.put(
    '/api/game/sharing',
    ...guard,
    handle({ body: sharingBody }, async ({ body, member }, response) => {
      await deps.game.share(member.id, body.shared)
      response.status(204).end()
    }),
  )
  router.put('/api/game/hints/:hint', ...guard, async (request, response) => {
    const params = hintParams.safeParse(request.params)
    if (!params.success) {
      notFound(response)
      return
    }
    await deps.game.seeHint(memberOf(response).id, params.data.hint)
    response.status(204).end()
  })

  return router
}
