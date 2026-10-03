import type { RequestHandler } from 'express'
import type { Permission } from '../access.js'
import type { AuthProvider, MemberRef } from '../auth/index.js'

/** The caller a guarded handler may rely on, set by `requirePermission`. */
export interface GuardedLocals {
  member: MemberRef
}

/** Lets a request through only when its member holds the permission (R-ROLE-3,
 * R-ROLE-5). Nobody signed in is 401; a member without it gets 404, so the
 * route's existence is not confirmed (R-NAV-8, constitution §5). */
export function requirePermission(
  auth: AuthProvider,
  permission: Permission,
): RequestHandler {
  return async (request, response, next) => {
    const member = await auth.currentMember(request)

    if (member === null) {
      response.status(401).json({ error: 'unauthenticated' })
      return
    }
    if (!member.permissions.includes(permission)) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    ;(response.locals as GuardedLocals).member = member
    next()
  }
}

/** Lets a request through for any signed-in active member, with no permission
 * asked: the onboarding routes, which come before everything else (R-ONB-1).
 * Nobody signed in is 401. */
export function requireSession(auth: AuthProvider): RequestHandler {
  return async (request, response, next) => {
    const member = await auth.currentMember(request)

    if (member === null) {
      response.status(401).json({ error: 'unauthenticated' })
      return
    }
    ;(response.locals as GuardedLocals).member = member
    next()
  }
}
