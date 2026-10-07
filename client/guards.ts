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
const PROFILE_STEP = '/onboarding'
const PRIVACY_STEP = '/onboarding/privacy'
const USAGE_STEP = '/onboarding/usage'

function withNext(path: string, next: string): string {
  return `${path}?next=${encodeURIComponent(next)}`
}

function homeOf(me: Me): string {
  return me.onboarded ? '/welcome' : '/onboarding'
}

function sameQuery(path: string, target: Target): string {
  return path + target.fullPath.slice(target.path.length)
}

const WELCOME: Decision = { kind: 'redirect', to: '/welcome' }

// The first two onboarding steps (design §4): done with once onboarded; a
// member with a stored name confirms new words without retyping the profile
// (F2); the privacy step needs a profile typed in this tab (R-ONB-7).
function firstSteps(
  target: Target,
  me: Me,
  profileTyped: boolean,
): Decision | null {
  if (me.onboarded) return WELCOME
  if (target.path === PROFILE_STEP && me.name !== null)
    return { kind: 'redirect', to: sameQuery(PRIVACY_STEP, target) }
  if (target.path === PRIVACY_STEP && me.name === null && !profileTyped)
    return { kind: 'redirect', to: sameQuery(PROFILE_STEP, target) }
  return null
}

// The usage step is done with once the member shares (R-ONB-11, R-ANA-6).
function onboardingStep(
  target: Target,
  me: Me,
  profileTyped: boolean,
): Decision | null {
  if (target.path === USAGE_STEP) return me.analyticsOptIn ? WELCOME : null
  if (target.path === PROFILE_STEP || target.path === PRIVACY_STEP)
    return firstSteps(target, me, profileTyped)
  return null
}

function permitted(target: Target, me: Me): Decision {
  return target.permission === undefined ||
    me.permissions.includes(target.permission)
    ? { kind: 'allow' }
    : { kind: 'not-found' }
}

/**
 * Where a navigation should go, as a pure function so the deep-link rules are
 * tested without a browser (design §4). A courtesy only: the server re-checks
 * every request (R-ROLE-5). Signed out → login with `next` (R-NAV-5);
 * onboarding first, step by step (R-NAV-7, R-ONB-6); a missing permission →
 * not found (R-NAV-8).
 */
export function decide(
  target: Target,
  me: Me | null,
  profileTyped = false,
): Decision {
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
  return onboardingStep(target, me, profileTyped) ?? permitted(target, me)
}
