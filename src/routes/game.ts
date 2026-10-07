import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Config, LiveSettings } from '../config.js'
import type { GameService } from '../services/game.js'
import { gameHints } from '../services/game.js'
import { createWindowCounter } from '../services/rate-limit.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

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
    response.status(404).json({ error: 'not_found' })
  }
}

const memberOf = (locals: unknown): string =>
  (locals as GuardedLocals).member.id

function recordDay(deps: Deps): RequestHandler {
  const counter = createWindowCounter({
    windowMinutes: () => RECORD_WINDOW_MINUTES,
  })
  return async (request, response) => {
    const body = dayBody.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const memberId = memberOf(response.locals)
    if (!counter.take(memberId, deps.config.gameRecordsPerMinute)) {
      response.status(429).json({ error: 'too_many_requests' })
      return
    }
    const result = await deps.game.recordDay(memberId, body.data)
    if (result === 'implausible') {
      response.status(422).json({ error: 'implausible' })
      return
    }
    response.json(result)
  }
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

  router.get('/api/game', ...guard, async (_request, response) => {
    response.json(await deps.game.state(memberOf(response.locals)))
  })
  router.post('/api/game/days', ...guard, recordDay(deps))
  router.get('/api/game/leaderboard', ...guard, async (_request, response) => {
    response.json(
      await deps.game.leaderboard(
        memberOf(response.locals),
        deps.config.gameLeaderboardSize,
      ),
    )
  })
  router.put('/api/game/sharing', ...guard, async (request, response) => {
    const body = sharingBody.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    await deps.game.share(memberOf(response.locals), body.data.shared)
    response.status(204).end()
  })
  router.put('/api/game/hints/:hint', ...guard, async (request, response) => {
    const params = hintParams.safeParse(request.params)
    if (!params.success) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    await deps.game.seeHint(memberOf(response.locals), params.data.hint)
    response.status(204).end()
  })

  return router
}
