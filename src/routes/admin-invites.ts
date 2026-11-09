import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type {
  BadgeChoice,
  InviteService,
  NewEventBadge,
  NewInvite,
} from '../services/invites.js'
import { handle, notFound } from './handle.js'
import { requirePermission } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

type InviteLimits = Pick<
  Limits,
  | 'inviteLabelMaxChars'
  | 'inviteMaxUsesCeiling'
  | 'eventBadgeNameMaxChars'
  | 'eventBadgeTicketMaxChars'
  | 'eventBadgeBigMaxChars'
>

// The width of event_badges.id (src/db/schema.ts).
const BADGE_ID_MAX_CHARS = 36

const words = (max: number): z.ZodString => z.string().trim().min(1).max(max)

// A new event badge's words and its logo as uploaded; the logo's size and
// contents are judged when it is cleaned (R-BADGE-4, R-BADGE-5).
function newBadge(limits: InviteLimits): z.ZodType<NewEventBadge> {
  return z.object({
    name: words(limits.eventBadgeNameMaxChars),
    ticketLine: words(limits.eventBadgeTicketMaxChars),
    bigLine: words(limits.eventBadgeBigMaxChars),
    logoSvg: z.string().min(1).optional(),
  })
}

// Another invite's badge or a new one, never both; neither is none.
function badgeFields(limits: InviteLimits): {
  eventBadgeId: z.ZodOptional<z.ZodString>
  eventBadge: z.ZodOptional<z.ZodType<NewEventBadge>>
} {
  return {
    eventBadgeId: z.string().min(1).max(BADGE_ID_MAX_CHARS).optional(),
    eventBadge: newBadge(limits).optional(),
  }
}

const notBoth = (input: BadgeChoice): boolean =>
  input.eventBadgeId === undefined || input.eventBadge === undefined

function badgeBody(limits: InviteLimits): z.ZodType<BadgeChoice> {
  return z.object(badgeFields(limits)).refine(notBoth)
}

function createBody(limits: InviteLimits): z.ZodType<NewInvite> {
  return z
    .object({
      label: z.string().trim().min(1).max(limits.inviteLabelMaxChars),
      validFrom: z.coerce.date().optional(),
      validUntil: z.coerce.date().optional(),
      maxUses: z
        .number()
        .int()
        .positive()
        .max(limits.inviteMaxUsesCeiling)
        .optional(),
      ...badgeFields(limits),
    })
    .refine(notBoth)
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

const badgeStatus = { not_found: 404, bad_logo: 400, unknown_badge: 400 }

function giveBadge(
  invites: InviteService,
  choice: z.ZodType<BadgeChoice>,
): RequestHandler {
  return handle(
    { params: inviteParams, body: choice },
    async ({ params, body }, response) => {
      const outcome = await invites.setBadge(params.id, body)
      if (outcome.result === 'set') {
        response.json({ invite: outcome.invite })
        return
      }
      response
        .status(badgeStatus[outcome.result])
        .json({ error: outcome.result })
    },
  )
}

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

/** F16 (design §3): list, create, revoke invite links, raise their caps and
 * set their badges, behind `invite:manage` (R-INV-4, R-INV-9, R-INV-13). */
export function adminInviteRoutes(deps: {
  auth: AuthProvider
  invites: InviteService
  config: { limits: InviteLimits }
}): Router {
  const router = Router()
  const guard = requirePermission(deps.auth, 'invite:manage')
  const body = createBody(deps.config.limits)
  const cap = capBody(deps.config.limits)

  router.get(apiPaths.invites, guard, async (_request, response) => {
    response.json({ invites: await deps.invites.list() })
  })

  router.post(
    apiPaths.invites,
    guard,
    handle({ body }, async ({ body, member }, response) => {
      const outcome = await deps.invites.create(body, member.id)
      if (outcome.result !== 'created') {
        response.status(400).json({ error: outcome.result })
        return
      }
      response.status(201).json({ invite: outcome.invite })
    }),
  )

  router.post(
    apiPaths.revokeInvite,
    guard,
    handle({ params: inviteParams }, async ({ params }, response) => {
      const outcome = await deps.invites.revoke(params.id)
      response.status(outcome === 'revoked' ? 204 : 404).end()
    }),
  )

  router.patch(apiPaths.invite, guard, raise(deps.invites, cap))
  router.put(
    apiPaths.inviteEventBadge,
    guard,
    giveBadge(deps.invites, badgeBody(deps.config.limits)),
  )

  return router
}

/** An event badge's logo, from the app's own origin, as a picture that can
 * run nothing and load nothing; public, as the poster it is printed on
 * (R-BADGE-5, design §8). */
export function eventBadgeLogoRoutes(deps: { invites: InviteService }): Router {
  const router = Router()
  router.get(apiPaths.eventBadgeLogo, async (request, response) => {
    const params = inviteParams.safeParse(request.params)
    const logo = params.success ? await deps.invites.logo(params.data.id) : null
    if (logo === null) {
      notFound(response)
      return
    }
    response
      .set({
        'Content-Type': 'image/svg+xml',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': 'public, max-age=31536000, immutable',
      })
      .send(logo)
  })
  return router
}
