import { Router } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { Limits } from '../config.js'
import type { ProfileEdit, ProfileStore } from '../services/profile.js'
import { displayName, optionalText } from './profile-fields.js'
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

/** `GET` and `PUT /api/profile` (design §3): the member's own profile and
 * privacy, and edits to it within the onboarding limits (R-PROF-1,2). */
export function profileRoutes(deps: {
  auth: AuthProvider
  profile: ProfileStore
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

  return router
}
