import { Router, type RequestHandler } from 'express'
import type { Tick } from '../services/tick.js'
import type { InvokerCheck } from '../services/tick-invoker.js'

/** The scheduler's tick (ADR 0049): the due work runs before the answer, a
 * 204 when all of it succeeded. A caller who is not the scheduler learns
 * nothing, not even that the route exists (constitution §5). */
export function tickRoutes(deps: {
  tick: Tick
  isInvoker: InvokerCheck
}): Router {
  const router = Router()

  router.post('/api/internal/tick', async (request, response) => {
    if (!(await deps.isInvoker(request.headers.authorization))) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    if (await deps.tick.run()) response.status(204).end()
    else response.status(500).json({ error: 'internal_error' })
  })

  return router
}

/** Brings the hosts' changes up to date before a request is handled, on
 * servers without a refresh timer (ADR 0031, ADR 0049). */
export function freshSettings(fresh: () => Promise<void>): RequestHandler {
  return async (_request, _response, next) => {
    await fresh()
    next()
  }
}
