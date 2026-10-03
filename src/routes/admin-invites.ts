import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type { InviteService, NewInvite } from '../services/invites.js'
import { requirePermission, type GuardedLocals } from './require-permission.js'

// invites.max_uses is INT UNSIGNED (migration 004).
const MAX_USES_CEILING = 0xffffffff

function createBody(
  limits: Pick<Limits, 'inviteLabelMaxChars'>,
): z.ZodType<NewInvite> {
  return z.object({
    label: z.string().trim().min(1).max(limits.inviteLabelMaxChars),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
    maxUses: z.number().int().positive().max(MAX_USES_CEILING).optional(),
  })
}

const inviteParams = z.object({ id: z.string().min(1) })

/** F16 (design §3): list, create and revoke invite links, behind
 * `invite:manage` (R-INV-9). */
export function adminInviteRoutes(deps: {
  auth: AuthProvider
  invites: InviteService
  config: { limits: Pick<Limits, 'inviteLabelMaxChars'> }
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'invite:manage')
  const body = createBody(deps.config.limits)

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

  return router
}
