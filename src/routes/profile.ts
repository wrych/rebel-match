import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits, LiveSettings } from '../config.js'
import type { ErasureService } from '../services/erasure.js'
import type { ProfileEdit, ProfileStore } from '../services/profile.js'
import { companySizeKeys, sectorKeys } from '../profile-options.js'
import {
  readSocialLink,
  socialNetworks,
  type SocialLinks,
} from '../social-links.js'
import { displayName, optionalChoice, optionalText } from './profile-fields.js'
import { setCookie } from './auth.js'
import { handle, memberOf, notFound } from './handle.js'
import { requireSession } from './require-permission.js'
import { apiPaths } from '../api-paths.js'

type TextLimits = Pick<
  Limits,
  'nameMaxChars' | 'jobTitleMaxChars' | 'orgMaxChars' | 'socialLinkMaxChars'
>

function editBody(limits: TextLimits): z.ZodType<ProfileEdit> {
  return z.object({
    name: displayName(limits.nameMaxChars),
    jobTitle: optionalText(limits.jobTitleMaxChars),
    org: optionalText(limits.orgMaxChars),
    sector: optionalChoice(sectorKeys),
    companySize: optionalChoice(companySizeKeys),
  })
}

const findableBody = z.object({ findable: z.boolean() })

const linksBody = z.object({
  linkedin: z.string().optional(),
})

function socialLinksOf(body: unknown, maxChars: number): SocialLinks | null {
  const typed = linksBody.safeParse(body)
  if (!typed.success) return null
  const links: SocialLinks = { linkedin: null }
  for (const network of socialNetworks) {
    const reading = readSocialLink(typed.data[network] ?? '', maxChars)
    if (reading.result === 'invalid') return null
    links[network] = reading.result === 'link' ? reading.url : null
  }
  return links
}

// While hosts have social links off, their address is as absent as one that
// never existed (R-PROF-5, R-NAV-8).
function setSocialLinks(deps: {
  profile: ProfileStore
  settings: Pick<LiveSettings, 'limits'>
  config: { limits: TextLimits }
}): RequestHandler {
  return async (request, response) => {
    if (deps.settings.limits().socialLinks !== 1) {
      notFound(response)
      return
    }
    const maxChars = deps.config.limits.socialLinkMaxChars
    const links = socialLinksOf(request.body, maxChars)
    if (links === null) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    await deps.profile.setSocialLinks(memberOf(response).id, links)
    response.status(204).end()
  }
}

function setFindable(profile: ProfileStore): RequestHandler {
  return handle({ body: findableBody }, async ({ body, member }, response) => {
    await profile.setFindable(member.id, body.findable)
    response.status(204).end()
  })
}

/** `GET`, `PUT` and `DELETE /api/profile` (design §3): the member's own
 * profile, edits within the onboarding limits, and erasing their own account
 * (R-PROF-1,2); `PUT /api/me/findable` whatever the switches say (R-FIND-5);
 * `PUT /api/me/social-links` behind its switch (R-PROF-5). */
export function profileRoutes(deps: {
  auth: AuthProvider
  profile: ProfileStore
  erasure: ErasureService
  config: { limits: TextLimits }
  settings: Pick<LiveSettings, 'limits'>
}): Router {
  const router = Router()
  const guard = requireSession(deps.auth)
  const body = editBody(deps.config.limits)

  router.get(apiPaths.profile, guard, async (_request, response) => {
    const own = await deps.profile.own(memberOf(response).id)
    if (own === null) {
      response.status(401).json({ error: 'unauthenticated' })
      return
    }
    response.json(own)
  })

  router.put(
    apiPaths.profile,
    guard,
    handle({ body }, async ({ body, member }, response) => {
      await deps.profile.update(member.id, body)
      response.status(204).end()
    }),
  )

  router.put(apiPaths.findable, guard, setFindable(deps.profile))
  router.put(apiPaths.socialLinks, guard, setSocialLinks(deps))

  // Deleting as a host does, refused for the same reasons, but marked as the
  // member's own so their emailed link can undo it (ADR 0032). The session
  // has ended, so its cookie is cleared too.
  router.delete(apiPaths.profile, guard, async (request, response) => {
    const outcome = await deps.erasure.delete(memberOf(response).id, true)
    if (
      outcome.result === 'last_admin' ||
      outcome.result === 'created_invites'
    ) {
      response.status(409).json({ result: outcome.result })
      return
    }
    setCookie(response, await deps.auth.endSession(request))
    response.json(
      outcome.result === 'scheduled'
        ? { eraseAfter: outcome.eraseAfter.toISOString() }
        : {},
    )
  })

  return router
}
