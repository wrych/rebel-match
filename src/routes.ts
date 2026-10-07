/**
 * The one route table (ADR 0017). The client router builds its routes from it
 * and the server validates `next` against it, so neither side can form a private
 * opinion about which paths exist.
 */

import type { Permission } from './access.js'

export type Access = 'public' | 'session' | 'onboarded'

export interface RouteDef {
  /** vue-router path, `:param` segments included. */
  path: string
  name: string
  access: Access
  /** Permission the member must hold, resolved from their roles (R-ROLE-3). */
  permission?: Permission
}

export const routeTable: readonly RouteDef[] = [
  { path: '/', name: 'entry', access: 'public' },
  { path: '/login', name: 'login', access: 'public' },
  { path: '/sign-in', name: 'sign-in', access: 'public' },
  { path: '/access-requested', name: 'access-requested', access: 'public' },
  { path: '/onboarding', name: 'onboarding', access: 'session' },
  {
    path: '/onboarding/privacy',
    name: 'onboarding-privacy',
    access: 'session',
  },
  { path: '/onboarding/usage', name: 'onboarding-usage', access: 'onboarded' },
  { path: '/privacy', name: 'privacy', access: 'public' },
  { path: '/terms', name: 'terms', access: 'public' },
  { path: '/impressum', name: 'impressum', access: 'public' },
  { path: '/welcome', name: 'welcome', access: 'onboarded' },
  { path: '/profile', name: 'profile', access: 'onboarded' },
  { path: '/notifications', name: 'notifications', access: 'onboarded' },
  { path: '/ask', name: 'ask', access: 'onboarded' },
  { path: '/challenges/:id', name: 'challenge', access: 'onboarded' },
  { path: '/challenges/:id/trend', name: 'trend-picker', access: 'onboarded' },
  { path: '/challenges/:id/matches', name: 'matches', access: 'onboarded' },
  {
    path: '/challenges/:challengeId/connect/:memberId',
    name: 'connect',
    access: 'onboarded',
  },
  { path: '/trends/:trendId', name: 'trend', access: 'onboarded' },
  { path: '/offer', name: 'offer', access: 'onboarded' },
  { path: '/offer/:challengeId/note', name: 'offer-note', access: 'onboarded' },
  { path: '/offer/done', name: 'offer-done', access: 'onboarded' },
  { path: '/matches', name: 'cockpit', access: 'onboarded' },
  { path: '/matches/requests/:id', name: 'request', access: 'onboarded' },
  {
    path: '/matches/requests/:id/contact',
    name: 'request-contact',
    access: 'onboarded',
  },
  {
    path: '/admin/applicants',
    name: 'admin-applicants',
    access: 'onboarded',
    permission: 'applicant:review',
  },
  {
    path: '/admin/invites',
    name: 'admin-invites',
    access: 'onboarded',
    permission: 'invite:manage',
  },
  {
    path: '/admin/members',
    name: 'admin-members',
    access: 'onboarded',
    permission: 'member:delete',
  },
  {
    path: '/admin/members/:id',
    name: 'admin-member',
    access: 'onboarded',
    permission: 'member:delete',
  },
  {
    path: '/admin/outbox',
    name: 'admin-outbox',
    access: 'onboarded',
    permission: 'outbox:read',
  },
  {
    path: '/admin/settings',
    name: 'admin-settings',
    access: 'onboarded',
    permission: 'settings:read',
  },
]

const SEGMENT = /^:[A-Za-z][A-Za-z0-9]*$/

function matches(route: RouteDef, path: string): boolean {
  const expected = route.path.split('/')
  const actual = path.split('/')
  if (expected.length !== actual.length) return false

  return expected.every((part, index) => {
    const given = actual[index] ?? ''
    return SEGMENT.test(part) ? given.length > 0 : part === given
  })
}

/** True when the path is one this application serves. Query strings and
 * fragments are not part of a route and are ignored. */
export function isKnownPath(path: string): boolean {
  const [withoutFragment = ''] = path.split('#')
  const [pathname = ''] = withoutFragment.split('?')

  return routeTable.some((route) => matches(route, pathname))
}

/**
 * Narrows a `next` parameter to somewhere safe to send a member (R-NAV-6).
 * Returns `/` for anything absolute, protocol-relative, backslash-escaped, or
 * not in the table — this value arrives from an email, so it is never trusted.
 */
export function safeNextPath(next: string | undefined): string {
  if (next === undefined || next === '') return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'
  if (next.includes('\\')) return '/'
  if (next.includes('://')) return '/'

  return isKnownPath(next) ? next : '/'
}
