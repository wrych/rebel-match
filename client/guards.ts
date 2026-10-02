import type { Access } from '../src/routes'
import type { Me } from './lib/session'

export interface Target {
  path: string
  fullPath: string
  access: Access
  permission?: string | undefined
}

export type Decision =
  { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'not-found' }

const SIGNED_OUT_ONLY = new Set(['/', '/login'])

function withNext(path: string, next: string): string {
  return `${path}?next=${encodeURIComponent(next)}`
}

function homeOf(me: Me): string {
  return me.onboarded ? '/welcome' : '/onboarding'
}

/**
 * Where a navigation should go, as a pure function so the deep-link rules are
 * tested without a browser (design §4). A courtesy only: the server re-checks
 * every request (R-ROLE-5). Signed out → login with `next` (R-NAV-5);
 * onboarding first (R-NAV-7); a missing permission → not found (R-NAV-8).
 */
export function decide(target: Target, me: Me | null): Decision {
  if (target.access === 'public') {
    return me !== null && SIGNED_OUT_ONLY.has(target.path)
      ? { kind: 'redirect', to: homeOf(me) }
      : { kind: 'allow' }
  }
  if (me === null) {
    return { kind: 'redirect', to: withNext('/login', target.fullPath) }
  }
  if (target.access === 'onboarded' && !me.onboarded) {
    return { kind: 'redirect', to: withNext('/onboarding', target.fullPath) }
  }
  if (
    target.permission !== undefined &&
    !me.permissions.includes(target.permission)
  ) {
    return { kind: 'not-found' }
  }
  return { kind: 'allow' }
}
