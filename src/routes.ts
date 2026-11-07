/**
 * The one route table (ADR 0017). The client router builds its routes from it
 * and the server validates `next` against it, so neither side can form a private
 * opinion about which paths exist.
 */

import type { Permission } from './access.js'
import { RECAP_TITLE } from './recap/title.js'

export type Access = 'public' | 'session' | 'onboarded'

export interface RouteDef {
  /** vue-router path, `:param` segments included. */
  path: string
  name: string
  /** The screen's name in its tab, after "Rebel Match | " (R-NAV-13). */
  title: string
  access: Access
  /** Permission the member must hold, resolved from their roles (R-ROLE-3). */
  permission?: Permission
}

export const routeTable: readonly RouteDef[] = [
  { path: '/', name: 'entry', title: 'Sign in', access: 'public' },
  { path: '/login', name: 'login', title: 'Sign in', access: 'public' },
  { path: '/sign-in', name: 'sign-in', title: 'Signing in', access: 'public' },
  {
    path: '/access-requested',
    name: 'access-requested',
    title: 'Access requested',
    access: 'public',
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    title: 'Your profile',
    access: 'session',
  },
  {
    path: '/onboarding/privacy',
    name: 'onboarding-privacy',
    title: 'Privacy',
    access: 'session',
  },
  {
    path: '/onboarding/usage',
    name: 'onboarding-usage',
    title: 'Usage data',
    access: 'onboarded',
  },
  {
    path: '/privacy',
    name: 'privacy',
    title: 'Privacy notice',
    access: 'public',
  },
  { path: '/terms', name: 'terms', title: 'Terms of use', access: 'public' },
  {
    path: '/impressum',
    name: 'impressum',
    title: 'Impressum',
    access: 'public',
  },
  {
    path: '/9torevolution',
    name: 'game',
    title: '9toRevolution',
    access: 'onboarded',
    permission: 'game:play',
  },
  {
    path: '/9torevolution/leaderboard',
    name: 'game-leaderboard',
    title: 'Leaderboard',
    access: 'onboarded',
    permission: 'game:play',
  },
  {
    path: '/network',
    name: 'network',
    title: 'The network',
    access: 'onboarded',
    permission: 'network:view',
  },
  { path: '/recap', name: 'recap', title: RECAP_TITLE, access: 'onboarded' },
  {
    path: '/me/code',
    name: 'my-code',
    title: 'Your code',
    access: 'onboarded',
  },
  {
    path: '/p',
    name: 'profile-code',
    title: 'A member',
    access: 'onboarded',
  },
  {
    path: '/p/connect',
    name: 'profile-code-connect',
    title: 'Connect directly',
    access: 'onboarded',
  },
  {
    path: '/c',
    name: 'live-code',
    title: 'Live connect code',
    access: 'public',
  },
  {
    path: '/people',
    name: 'people',
    title: 'Find a member',
    access: 'onboarded',
    permission: 'member:search',
  },
  {
    path: '/people/:memberId',
    name: 'person',
    title: 'A member',
    access: 'onboarded',
    permission: 'member:search',
  },
  {
    path: '/people/:memberId/connect',
    name: 'person-connect',
    title: 'Connect directly',
    access: 'onboarded',
    permission: 'member:search',
  },
  { path: '/welcome', name: 'welcome', title: 'Welcome', access: 'onboarded' },
  { path: '/profile', name: 'profile', title: 'Profile', access: 'onboarded' },
  {
    path: '/notifications',
    name: 'notifications',
    title: 'Notifications',
    access: 'onboarded',
  },
  { path: '/badges', name: 'badges', title: 'Badges', access: 'onboarded' },
  {
    path: '/badges/events',
    name: 'badge-events',
    title: 'Event badges',
    access: 'onboarded',
  },
  {
    path: '/badges/:row',
    name: 'badge-row',
    title: 'Badges',
    access: 'onboarded',
  },
  { path: '/ask', name: 'ask', title: 'Ask for help', access: 'onboarded' },
  {
    path: '/challenges/:id',
    name: 'challenge',
    title: 'Your domain',
    access: 'onboarded',
  },
  {
    path: '/challenges/:id/trend',
    name: 'trend-picker',
    title: 'Pick a trend',
    access: 'onboarded',
  },
  {
    path: '/challenges/:id/matches',
    name: 'matches',
    title: 'Your matches',
    access: 'onboarded',
  },
  {
    path: '/challenges/:challengeId/connect/:memberId',
    name: 'connect',
    title: 'Connect',
    access: 'onboarded',
  },
  {
    path: '/trends/:trendId',
    name: 'trend',
    title: 'Trend',
    access: 'onboarded',
  },
  { path: '/offer', name: 'offer', title: 'Offer help', access: 'onboarded' },
  {
    path: '/offer/:challengeId/note',
    name: 'offer-note',
    title: 'Been there',
    access: 'onboarded',
  },
  {
    path: '/offer/done',
    name: 'offer-done',
    title: 'Deck done',
    access: 'onboarded',
  },
  { path: '/matches', name: 'cockpit', title: 'Matches', access: 'onboarded' },
  {
    path: '/matches/requests/:id',
    name: 'request',
    title: 'Request',
    access: 'onboarded',
  },
  {
    path: '/matches/requests/:id/contact',
    name: 'request-contact',
    title: 'Contact',
    access: 'onboarded',
  },
  {
    path: '/report/challenge/:id',
    name: 'report-challenge',
    title: 'Report',
    access: 'onboarded',
    permission: 'content:report',
  },
  {
    path: '/report/request/:id',
    name: 'report-request',
    title: 'Report',
    access: 'onboarded',
    permission: 'content:report',
  },
  {
    path: '/admin/applicants',
    name: 'admin-applicants',
    title: 'Applicants',
    access: 'onboarded',
    permission: 'applicant:review',
  },
  {
    path: '/admin/invites',
    name: 'admin-invites',
    title: 'Invites',
    access: 'onboarded',
    permission: 'invite:manage',
  },
  {
    path: '/admin/members',
    name: 'admin-members',
    title: 'Members',
    access: 'onboarded',
    permission: 'member:delete',
  },
  {
    path: '/admin/members/:id',
    name: 'admin-member',
    title: 'Member',
    access: 'onboarded',
    permission: 'member:delete',
  },
  {
    path: '/admin/moderation',
    name: 'admin-moderation',
    title: 'Moderation',
    access: 'onboarded',
    permission: 'report:review',
  },
  {
    path: '/admin/moderation/:memberId',
    name: 'admin-moderated-member',
    title: 'Reported member',
    access: 'onboarded',
    permission: 'report:review',
  },
  {
    path: '/admin/outbox',
    name: 'admin-outbox',
    title: 'Outbox',
    access: 'onboarded',
    permission: 'outbox:read',
  },
  {
    path: '/admin/presentation',
    name: 'admin-presentation',
    title: 'Presentation',
    access: 'onboarded',
    permission: 'network:present',
  },
  {
    path: '/admin/settings',
    name: 'admin-settings',
    title: 'Settings',
    access: 'onboarded',
    permission: 'settings:read',
  },
]

const APP_NAME = 'Rebel Match'
/** What a tab says for a path no screen serves (R-NAV-13). */
export const NOT_FOUND_TITLE = 'Not found'

/** A screen's title as a tab shows it (R-NAV-13). */
export function pageTitle(screen: string): string {
  return `${APP_NAME} | ${screen}`
}

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

function routeFor(path: string): RouteDef | undefined {
  const [withoutFragment = ''] = path.split('#')
  const [pathname = ''] = withoutFragment.split('?')
  return routeTable.find((route) => matches(route, pathname))
}

/** The tab title for a path: its screen's, or "Not found" for a path no
 * screen serves (R-NAV-13). Query strings and fragments are ignored. */
export function titleForPath(path: string): string {
  return pageTitle(routeFor(path)?.title ?? NOT_FOUND_TITLE)
}

/** True when the path is one this application serves. Query strings and
 * fragments are not part of a route and are ignored. */
export function isKnownPath(path: string): boolean {
  return routeFor(path) !== undefined
}

const CODE_PATHS: readonly string[] = ['/p', '/p/connect']

// A live code lives seconds, so it is never carried through sign-in
// (R-CODE-7).
const isLiveCodePath = (path: string): boolean => /^\/c(?:[?#]|$)/.test(path)

/** A path as `next` carries it: a fragment kept on `/p` and `/p/connect`
 * alone, where it holds the profile code, and dropped on every other path
 * (R-CODE-3, R-NAV-6). */
export function nextOf(fullPath: string): string {
  const [beforeFragment = '', ...fragment] = fullPath.split('#')
  const [pathname = ''] = beforeFragment.split('?')
  if (fragment.length === 0 || !CODE_PATHS.includes(pathname))
    return beforeFragment
  return `${beforeFragment}#${fragment.join('#')}`
}

/**
 * Narrows a `next` parameter to somewhere safe to send a member (R-NAV-6).
 * Returns `/` for anything absolute, protocol-relative, backslash-escaped,
 * a live code, or not in the table — this value arrives from an email, so
 * it is never trusted.
 */
export function safeNextPath(next: string | undefined): string {
  if (next === undefined || next === '') return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'
  if (next.includes('\\')) return '/'
  if (next.includes('://')) return '/'

  if (!isKnownPath(next) || isLiveCodePath(next)) return '/'
  return nextOf(next)
}
