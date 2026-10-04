import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type { ErasureService } from '../services/erasure.js'
import type { ProfileEdit, ProfileStore } from '../services/profile.js'
import { displayName, optionalText } from './profile-fields.js'
import { setCookie } from './auth.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

type TextLimits = Pick<
  Limits,
  'nameMaxChars' | 'jobTitleMaxChars' | 'orgMaxChars'
>

function editBody(limits: TextLimits): z.ZodType<ProfileEdit> {
  return z.object({
    name: displayName(limits.nameMaxChars),
    jobTitle: optionalText(limits.jobTitleMaxChars),
    org: optionalText(limits.orgMaxChars),
  })
}

/** `GET`, `PUT` and `DELETE /api/profile` (design §3): the member's own
 * profile and privacy, edits within the onboarding limits, and erasing their
 * own account (R-PROF-1,2). */
export function profileRoutes(deps: {
  auth: AuthProvider
  profile: ProfileStore
  erasure: ErasureService
  config: { limits: TextLimits }
}): Router {
  const router = Router()
  const guard = requireSession(deps.auth)
  const body = editBody(deps.config.limits)

  router.get('/api/profile', guard, async (_request, response) => {
    const member = (response.locals as GuardedLocals).member
    const own = await deps.profile.own(member.id)
    if (own === null) {
      response.status(401).json({ error: 'unauthenticated' })
      return
    }
    response.json(own)
  })

  router.put('/api/profile', guard, async (request, response) => {
    const edit = body.safeParse(request.body)
    if (!edit.success) {
      response.status(400).json({ error: 'bad_request' })
      return
    }
    const member = (response.locals as GuardedLocals).member
    await deps.profile.update(member.id, edit.data)
    response.status(204).end()
  })

  // The same erasure a host runs, refused for the same reasons; once done
  // the session is gone, so its cookie is cleared too.
  router.delete('/api/profile', guard, async (request, response) => {
    const member = (response.locals as GuardedLocals).member
    const outcome = await deps.erasure.erase(member.id)
    if (outcome === 'last_admin' || outcome === 'created_invites') {
      response.status(409).json({ result: outcome })
      return
    }
    setCookie(response, await deps.auth.endSession(request))
    response.status(204).end()
  })

  return router
}
