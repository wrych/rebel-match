import { randomUUID } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits, LiveSettings } from '../config.js'
import type { ChallengeService } from '../services/challenges.js'
import { withdrawStatus } from '../outcomes.js'
import { handle, replyFound, replyOutcome } from './handle.js'
import { requirePermission, requireSession } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

const challengeParams = z.object({ id: z.string().min(1) })
const confirmBody = z.object({ trendId: z.string().min(1) })
const trendParams = z.object({ trendId: z.string().min(1) })
const newestQuery = z.object({ trend: z.string().min(1).optional() })

const confirmStatus = {
  saved: 204,
  not_found: 404,
  unknown_trend: 400,
} as const

type Deps = {
  auth: AuthProvider
  challenges: ChallengeService
  settings: Pick<LiveSettings, 'limits'>
}

function createBody(
  limits: Pick<Limits, 'challengeMinChars' | 'challengeMaxChars'>,
): z.ZodType<{ body: string }> {
  return z.object({
    body: z
      .string()
      .trim()
      .min(limits.challengeMinChars)
      .max(limits.challengeMaxChars),
  })
}

function create(deps: Deps): RequestHandler {
  return handle(
    () => ({ body: createBody(deps.settings.limits()) }),
    async ({ body, member }, response) => {
      const challenge = await deps.challenges.create(
        member.id,
        body.body,
        randomUUID,
      )
      response.status(201).json({ challenge })
    },
  )
}

function confirm(deps: Deps): RequestHandler {
  return handle(
    { params: challengeParams, body: confirmBody },
    async ({ params, body, member }, response) => {
      const outcome = await deps.challenges.confirmTrend(
        member.id,
        params.id,
        body.trendId,
      )
      replyOutcome(response, confirmStatus, outcome)
    },
  )
}

function withdraw(deps: Deps): RequestHandler {
  return handle(
    { params: challengeParams },
    async ({ params, member }, response) => {
      const outcome = await deps.challenges.withdraw(member.id, params.id)
      replyOutcome(response, withdrawStatus, outcome)
    },
  )
}

function newest(deps: Deps): RequestHandler {
  return handle({ query: newestQuery }, async ({ query, member }, response) => {
    const challenges = await deps.challenges.newest(
      member.id,
      query.trend ?? null,
    )
    response.json({ challenges })
  })
}

// Answers what `read` finds for the author, and 404 for anything else.
function ownOnly(
  read: (memberId: string, id: string) => Promise<object | null>,
  key?: string,
): RequestHandler {
  return handle(
    { params: challengeParams },
    async ({ params, member }, response) => {
      replyFound(response, await read(member.id, params.id), key)
    },
  )
}

/** The Ask journey's API (design §3): trends to pick from, others' newest
 * challenges, a challenge written and matched, its trend confirmed, its
 * matches, and its withdrawal. Writing needs `challenge:create`; reading one's own challenge is
 * its author's alone (R-NAV-8). */
export function challengeRoutes(deps: Deps): Router {
  const router = Router()
  const write = requirePermission(deps.auth, 'challenge:create')

  router.get(apiPaths.trends, async (_request, response) => {
    response.json({ trends: await deps.challenges.trends() })
  })
  router.get(
    apiPaths.trend,
    requireSession(deps.auth),
    handle({ params: trendParams }, async ({ params, member }, response) => {
      replyFound(
        response,
        await deps.challenges.trend(member.id, params.trendId),
      )
    }),
  )
  router.get(
    apiPaths.newestChallenges,
    requirePermission(deps.auth, 'challenge:swipe'),
    newest(deps),
  )
  router.post(apiPaths.challenges, write, create(deps))
  router.get(
    apiPaths.challenge,
    write,
    ownOnly((memberId, id) => deps.challenges.get(memberId, id), 'challenge'),
  )
  router.patch(apiPaths.challenge, write, confirm(deps))
  router.post(apiPaths.withdrawChallenge, write, withdraw(deps))
  router.get(
    apiPaths.challengeMatches,
    write,
    ownOnly((memberId, id) => deps.challenges.matches(memberId, id)),
  )

  return router
}
