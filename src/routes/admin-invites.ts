import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type { InviteService, NewInvite } from '../services/invites.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

type InviteLimits = Pick<Limits, 'inviteLabelMaxChars' | 'inviteMaxUsesCeiling'>

function createBody(limits: InviteLimits): z.ZodType<NewInvite> {
  return z.object({
    label: z.string().trim().min(1).max(limits.inviteLabelMaxChars),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
    maxUses: z
      .number()
      .int()
      .positive()
      .max(limits.inviteMaxUsesCeiling)
      .optional(),
  })
}

const inviteParams = z.object({ id: z.string().min(1) })

function capBody(limits: InviteLimits): z.ZodType<{ maxUses: number }> {
  return z.object({
    maxUses: z.number().int().positive().max(limits.inviteMaxUsesCeiling),
  })
}

const raiseStatus = { not_found: 404, revoked: 409, not_higher: 400 } as const
const raiseError = {
  not_found: 'not_found',
  revoked: 'revoked',
  not_higher: 'bad_cap',
} as const

function raise(
  invites: InviteService,
  cap: z.ZodType<{ maxUses: number }>,
): RequestHandler {
  return async (request, response) => {
    const params = inviteParams.safeParse(request.params)
    const input = cap.safeParse(request.body)
    if (!params.success || !input.success) {
      response.status(400).json({ error: 'bad_cap' })
      return
    }
    const outcome = await invites.raiseCap(params.data.id, input.data.maxUses)
    if (outcome.result === 'raised') {
      response.json({ invite: outcome.invite })
      return
    }
    response
      .status(raiseStatus[outcome.result])
      .json({ error: raiseError[outcome.result] })
  }
}

/** F16 (design §3): list, create, revoke invite links and raise their caps,
 * behind `invite:manage` (R-INV-4, R-INV-9). */
export function adminInviteRoutes(deps: {
  auth: AuthProvider
  invites: InviteService
  config: { limits: InviteLimits }
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'invite:manage')
  const body = createBody(deps.config.limits)
  const cap = capBody(deps.config.limits)

  router.get('/api/admin/invites', guard, async (_request, response) => {
    response.json({ invites: await deps.invites.list() })
  })

  router.post('/api/admin/invites', guard, async (request, response) => {
    const input = body.safeParse(request.body)
    if (!input.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const actor = (response.locals as GuardedLocals).member
    const outcome = await deps.invites.create(input.data, actor.id)
    if (outcome.result === 'bad_window') {
      response.status(400).json({ error: 'bad_window' })
      return
    }
    response.status(201).json({ invite: outcome.invite })
  })

  router.post(
    '/api/admin/invites/:id/revoke',
    guard,
    async (request, response) => {
      const params = inviteParams.safeParse(request.params)
      if (!params.success) {
        response.status(400).json({ error: 'bad_request' })
        return
      }
      const outcome = await deps.invites.revoke(params.data.id)
      response.status(outcome === 'revoked' ? 204 : 404).end()
    },
  )

  router.patch('/api/admin/invites/:id', guard, raise(deps.invites, cap))

  return router
}
