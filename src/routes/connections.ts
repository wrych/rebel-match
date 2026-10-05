import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type {
  ConnectionService,
  NewConnection,
} from '../services/connections.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

type Deps = {
  auth: AuthProvider
  connections: ConnectionService
  config: { limits: Pick<Limits, 'connectionMessageMaxChars'> }
}

const idParams = z.object({ id: z.string().min(1) })

function memberOf(locals: unknown): string {
  return (locals as GuardedLocals).member.id
}

function requestBody(
  limits: Deps['config']['limits'],
): z.ZodType<NewConnection> {
  return z.object({
    targetId: z.string().min(1),
    challengeId: z.string().min(1).optional(),
    kind: z.enum(['same_boat', 'been_there']),
    message: z
      .string()
      .trim()
      .max(limits.connectionMessageMaxChars)
      .optional()
      .transform((m) => (m === '' ? undefined : m)),
  })
}

const statusOf = { created: 201, exists: 409, joined: 200 } as const

function create(deps: Deps): RequestHandler {
  const body = requestBody(deps.config.limits)
  return async (request, response) => {
    const input = body.safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const outcome = await deps.connections.request(
      memberOf(response.locals),
      input.data,
    )
    if (outcome.result === 'not_found') {
      response.status(404).json({ error: 'not_found' })
      return
    }
    response.status(statusOf[outcome.result]).json(outcome)
  }
}

function answer(deps: Deps, verdict: 'accepted' | 'declined'): RequestHandler {
  return async (request, response) => {
    const { id } = idParams.parse(request.params)
    const outcome = await deps.connections.respond(
      memberOf(response.locals),
      id,
      verdict,
    )
    response.status(outcome === 'done' ? 204 : 404).end()
  }
}

// Answers what `read` finds for the caller, and 404 for anything they may not
// see, so a request's existence is never confirmed to a stranger (R-NAV-8).
function partyOnly(
  read: (memberId: string, id: string) => Promise<object | null>,
  key: string,
): RequestHandler {
  return async (request, response) => {
    const { id } = idParams.parse(request.params)
    const found = await read(memberOf(response.locals), id)
    if (found === null) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    response.json({ [key]: found })
  }
}

/** The double opt-in API (design §3, F7, ADR 0004), behind
 * `connection:request`. Nothing here returns an email except the contact
 * read, and that only for an accepted request to one of its parties. */
export function connectionRoutes(deps: Deps): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'connection:request')
  const service = deps.connections

  router.post('/api/connections', guard, create(deps))
  router.get('/api/connections/incoming', guard, async (_q, response) => {
    response.json({
      requests: await service.incoming(memberOf(response.locals)),
    })
  })
  router.get('/api/connections/connected', guard, async (_q, response) => {
    response.json({
      connections: await service.connected(memberOf(response.locals)),
    })
  })
  router.get(
    '/api/connections/:id',
    guard,
    partyOnly((memberId, id) => service.get(memberId, id), 'request'),
  )
  router.post('/api/connections/:id/accept', guard, answer(deps, 'accepted'))
  router.post('/api/connections/:id/decline', guard, answer(deps, 'declined'))
  router.get(
    '/api/connections/:id/contact',
    guard,
    partyOnly((memberId, id) => service.contact(memberId, id), 'contact'),
  )

  return router
}
