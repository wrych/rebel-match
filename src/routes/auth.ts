import { Router, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import type { AuthProvider, SessionCookie } from '../auth/index.js'
import { trackNothing, type Track } from '../services/analytics.js'
import type { ErasureService } from '../services/erasure.js'
import type { MemberProfiles } from '../services/member-profiles.js'
import { safeNextPath } from '../routes.js'

const verifyQuery = z.object({ token: z.string().min(1) })
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
function verify(
  deps: {
    auth: AuthProvider
    erasure: Pick<ErasureService, 'restoreOwn'>
  },
  track: Track,
): RequestHandler {
  return async (request, response) => {
    const body = verifyBody.safeParse(request.body)
    const result = body.success
      ? await deps.auth.verifyToken(body.data.token)
      : ({ ok: false, reason: 'unknown' } as const)

    if (!result.ok) {
      response.status(400).json({ reason: result.reason })
      return
    }
    // A keep-it link restores the account its member deleted before they
    // are signed in, or the new session would find nobody active (ADR 0032).
    if (result.kind === 'restore')
      await deps.erasure.restoreOwn(result.memberId)
    // A browser someone else used, or one handed a planted cookie, must not
    // carry that session past the moment its new owner signs in.
    await deps.auth.endSession(request)
    setCookie(response, await deps.auth.createSession(result.memberId))
    void track(result.memberId, { name: 'login_completed' })
    response.json({ next: safeNextPath(result.next) })
  }
}

/** `/auth/verify`, `/auth/me` and `/auth/logout` (design §3). Thin: every
 * decision about a credential is the seam's (ADR 0015). Opening a link never
 * uses it; only the sign-in screen's POST does (R-AUTH-5, ADR 0027). */
export function authRoutes(deps: {
  auth: AuthProvider
  profiles: MemberProfiles
  erasure: Pick<ErasureService, 'restoreOwn'>
  track?: Track
}): Router {
  const track = deps.track ?? trackNothing
  const router = Router()

  // Links sent before ADR 0027 point here. Opening one must not use it, so
  // the token only moves into the sign-in screen's fragment.
  router.get('/auth/verify', (request, response) => {
    const query = verifyQuery.safeParse(request.query)
    const fragment = query.success
      ? `#token=${encodeURIComponent(query.data.token)}`
      : ''
    response.redirect(303, `/sign-in${fragment}`)
  })

  router.post('/auth/verify', verify(deps, track))

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
