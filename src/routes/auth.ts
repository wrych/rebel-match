import { Router, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import type { AuthProvider, SessionCookie } from '../auth/index.js'
import type { MemberProfiles } from '../services/member-profiles.js'
import type { SignIn } from '../services/sign-in.js'

const verifyBody = z.object({ token: z.string().min(1) })

/** Sets or clears the session cookie the seam describes. */
export function setCookie(response: Response, cookie: SessionCookie): void {
  response.cookie(cookie.name, cookie.value, cookie.options)
}

/** Slides the caller's session forward and refreshes its cookie, at most once
 * a day per session (R-AUTH-7, ADR 0020). */
export function renewSessions(auth: AuthProvider): RequestHandler {
  return async (request, response, next) => {
    const cookie = await auth.renewSession(request)
    if (cookie !== null) setCookie(response, cookie)
    next()
  }
}

// Signs in with a link's token from the sign-in screen's button (ADR 0027).
function verify(signIn: SignIn): RequestHandler {
  return async (request, response) => {
    const body = verifyBody.safeParse(request.body)
    const result = body.success
      ? await signIn(request, body.data.token)
      : ({ ok: false, reason: 'unknown' } as const)

    if (!result.ok) {
      response.status(400).json({ reason: result.reason })
      return
    }
    setCookie(response, result.cookie)
    response.json({ next: result.next })
  }
}

/** `/auth/verify`, `/auth/me` and `/auth/logout` (design §3). Thin: every
 * decision about a credential is the seam's (ADR 0015). Opening a link never
 * uses it; only the sign-in screen's POST does (R-AUTH-5, ADR 0027). */
export function authRoutes(deps: {
  auth: AuthProvider
  profiles: MemberProfiles
  signIn: SignIn
}): Router {
  const router = Router()

  router.post('/auth/verify', verify(deps.signIn))

  router.get('/auth/me', async (request, response) => {
    const member = await deps.auth.currentMember(request)
    const profile =
      member === null ? null : await deps.profiles.profile(member.id)

    if (member === null || profile === null) {
      response.status(401).json({ error: 'unauthenticated' })
      return
    }
    response.json({
      id: member.id,
      ...profile,
      roles: member.roles,
      permissions: member.permissions,
    })
  })

  router.post('/auth/logout', async (request, response) => {
    setCookie(response, await deps.auth.endSession(request))
    response.status(204).end()
  })

  return router
}
