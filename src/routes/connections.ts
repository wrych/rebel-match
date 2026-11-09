import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type {
  ConnectionService,
  NewConnection,
} from '../services/connections.js'
import { handle, memberOf, notFound, replyFound } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

type Deps = {
  auth: AuthProvider
  connections: ConnectionService
  config: { limits: Pick<Limits, 'connectionMessageMaxChars'> }
}

const idParams = z.object({ id: z.string().min(1) })

function requestBody(
  limits: Deps['config']['limits'],
): z.ZodType<NewConnection> {
  return z.object({
    targetId: z.string().min(1),
    challengeId: z.string().min(1).optional(),
    kind: z.enum(['same_boat', 'been_there', 'direct']),
    message: z
      .string()
      .trim()
      .max(limits.connectionMessageMaxChars)
      .optional()
      .transform((m) => (m === '' ? undefined : m)),
    profileCode: z.string().min(1).max(100).optional(),
  })
}

const statusOf = {
  created: 201,
  exists: 409,
  joined: 200,
  limit: 429,
} as const

function create(deps: Deps): RequestHandler {
  const body = requestBody(deps.config.limits)
  return handle({ body }, async ({ body, member }, response) => {
    const outcome = await deps.connections.request(member.id, body)
    if (outcome.result === 'not_found') {
      notFound(response)
      return
    }
    response.status(statusOf[outcome.result]).json(outcome)
  })
}

function answer(deps: Deps, verdict: 'accepted' | 'declined'): RequestHandler {
  return handle({ params: idParams }, async ({ params, member }, response) => {
    const outcome = await deps.connections.respond(
      member.id,
      params.id,
      verdict,
    )
    response.status(outcome === 'done' ? 204 : 404).end()
  })
}

// Answers what `read` finds for the caller, and 404 for anything they may not
// see, so a request's existence is never confirmed to a stranger (R-NAV-8).
function partyOnly(
  read: (memberId: string, id: string) => Promise<object | null>,
  key: string,
): RequestHandler {
  return handle({ params: idParams }, async ({ params, member }, response) => {
    replyFound(response, await read(member.id, params.id), key)
  })
}

/** The double opt-in API (design §3, F7, ADR 0004), behind
 * `connection:request`. Nothing here returns an email except the contact
 * read, and that only for an accepted request to one of its parties. */
export function connectionRoutes(deps: Deps): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'connection:request')
  const service = deps.connections

  router.post(apiPaths.connections, guard, create(deps))
  router.get(apiPaths.incomingConnections, guard, async (_q, response) => {
    response.json({
      requests: await service.incoming(memberOf(response).id),
    })
  })
  router.get(apiPaths.connectedConnections, guard, async (_q, response) => {
    response.json({
      connections: await service.connected(memberOf(response).id),
    })
  })
  router.get(
    apiPaths.connection,
    guard,
    partyOnly((memberId, id) => service.get(memberId, id), 'request'),
  )
  router.post(apiPaths.acceptConnection, guard, answer(deps, 'accepted'))
  router.post(apiPaths.declineConnection, guard, answer(deps, 'declined'))
  router.get(
    apiPaths.connectionContact,
    guard,
    partyOnly((memberId, id) => service.contact(memberId, id), 'contact'),
  )

  return router
}
