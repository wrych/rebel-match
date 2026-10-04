import { randomUUID } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { ChallengeService } from '../services/challenges.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

const challengeParams = z.object({ id: z.string().min(1) })
const confirmBody = z.object({ trendId: z.string().min(1) })
const trendParams = z.object({ trendId: z.string().min(1) })

const confirmStatus = {
  saved: 204,
  not_found: 404,
  unknown_trend: 400,
} as const

function memberOf(locals: unknown): string {
  return (locals as GuardedLocals).member.id
}

type Deps = {
  auth: AuthProvider
  challenges: ChallengeService
  settings: Pick<LiveSettings, 'limits'>
}

function createBody(minChars: number): z.ZodType<{ body: string }> {
  return z.object({ body: z.string().trim().min(minChars) })
}

function create(deps: Deps): RequestHandler {
  return async (request, response) => {
    const input = createBody(
      deps.settings.limits().challengeMinChars,
    ).safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const challenge = await deps.challenges.create(
      memberOf(response.locals),
      input.data.body,
      randomUUID,
    )
    response.status(201).json({ challenge })
  }
}

function confirm(deps: Deps): RequestHandler {
  return async (request, response) => {
    const params = challengeParams.parse(request.params)
    const input = confirmBody.safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const outcome = await deps.challenges.confirmTrend(
      memberOf(response.locals),
      params.id,
      input.data.trendId,
    )
    response.status(confirmStatus[outcome]).json({ result: outcome })
  }
}

// Answers what `read` finds for the author, and 404 for anything else.
function ownOnly(
  read: (memberId: string, id: string) => Promise<object | null>,
  wrap: (found: object) => object,
): RequestHandler {
  return async (request, response) => {
    const params = challengeParams.parse(request.params)
    const found = await read(memberOf(response.locals), params.id)
    if (found === null) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    response.json(wrap(found))
  }
}

/** The Ask journey's API (design §3): trends to pick from, a challenge
 * written and matched, its trend confirmed, and its matches. Writing needs
 * `challenge:create`; reading a challenge is its author's alone (R-NAV-8). */
export function challengeRoutes(deps: Deps): Router {
  const router = Router()
  const write = requirePermission(deps.auth, 'challenge:create')

  router.get('/api/trends', async (_request, response) => {
    response.json({ trends: await deps.challenges.trends() })
  })
  router.get('/api/trends/:trendId', async (request, response) => {
    const { trendId } = trendParams.parse(request.params)
    const detail = await deps.challenges.trend(trendId)
    if (detail === null) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    response.json(detail)
  })
  router.post('/api/challenges', write, create(deps))
  router.get(
    '/api/challenges/:id',
    write,
    ownOnly(
      (memberId, id) => deps.challenges.get(memberId, id),
      (challenge) => ({ challenge }),
    ),
  )
  router.patch('/api/challenges/:id', write, confirm(deps))
  router.get(
    '/api/challenges/:id/matches',
    write,
    ownOnly(
      (memberId, id) => deps.challenges.matches(memberId, id),
      (matches) => matches,
    ),
  )

  return router
}
