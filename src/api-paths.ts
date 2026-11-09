// Every JSON endpoint's path, stated once and free of server dependencies:
// the server registers these patterns and the client fills them (ADR 0017).

/** Each endpoint's Express pattern, by name (design §3). */
export const apiPaths = {
  health: '/api/health',
  config: '/api/config',
  flags: '/api/flags',
  events: '/api/events',
  feedback: '/api/feedback',
  tick: '/api/internal/tick',

  verify: '/auth/verify',
  me: '/auth/me',
  logout: '/auth/logout',
  requestLink: '/auth/request-link',
  applicant: '/auth/applicant',
  inviteOpened: '/auth/invite-opened',

  onboarding: '/api/onboarding',
  analyticsConsent: '/api/me/analytics',
  profile: '/api/profile',
  findable: '/api/me/findable',
  socialLinks: '/api/me/social-links',
  history: '/api/me/history',
  ownPhoto: '/api/profile/photo',
  sharedPhoto: '/api/photos/:key',
  profileCode: '/api/me/profile-code',
  resetProfileCode: '/api/me/profile-code/reset',
  openProfileCode: '/api/profile-codes/open',
  liveCodes: '/api/me/live-codes',
  redeemLiveCode: '/api/live-codes/redeem',

  trends: '/api/trends',
  trend: '/api/trends/:trendId',
  challenges: '/api/challenges',
  newestChallenges: '/api/challenges/newest',
  challenge: '/api/challenges/:id',
  challengeMatches: '/api/challenges/:id/matches',
  withdrawChallenge: '/api/challenges/:id/withdraw',
  deck: '/api/deck',
  deckSeen: '/api/deck/seen',
  swipe: '/api/swipe',

  connections: '/api/connections',
  incomingConnections: '/api/connections/incoming',
  connectedConnections: '/api/connections/connected',
  connection: '/api/connections/:id',
  acceptConnection: '/api/connections/:id/accept',
  declineConnection: '/api/connections/:id/decline',
  connectionContact: '/api/connections/:id/contact',

  cockpit: '/api/cockpit',
  matchesSeen: '/api/matches/seen',
  follows: '/api/follows',
  follow: '/api/follows/:trendId',
  notifications: '/api/notifications',
  newNotifications: '/api/notifications/new',
  notificationsSeen: '/api/notifications/seen',
  notificationSettings: '/api/me/notification-settings',
  notificationSetting: '/api/me/notification-settings/:type',
  badges: '/api/badges',
  newBadges: '/api/badges/new',
  badgesSeen: '/api/badges/seen',
  claimBadge: '/api/badges/claim',
  eventBadgeLogo: '/api/event-badges/:id/logo.svg',

  reports: '/api/reports',
  challengeReport: '/api/reports/challenge/:id',
  requestReport: '/api/reports/request/:id',

  game: '/api/game',
  gameDoor: '/api/game/door',
  gameDays: '/api/game/days',
  gameLeaderboard: '/api/game/leaderboard',
  gameSharing: '/api/game/sharing',
  gameHint: '/api/game/hints/:hint',
  network: '/api/network',
  recap: '/api/recap',
  memberSearch: '/api/members/search',
  memberCard: '/api/members/:id/card',

  adminMembers: '/api/admin/members',
  adminMember: '/api/admin/members/:id',
  restoreMember: '/api/admin/members/:id/restore',
  banMember: '/api/admin/members/:id/ban',
  unbanMember: '/api/admin/members/:id/unban',
  memberRoles: '/api/admin/members/:id/roles',
  memberRole: '/api/admin/members/:id/roles/:role',
  memberChallenges: '/api/admin/members/:id/challenges',
  memberPhoto: '/api/admin/members/:id/photo',
  hideChallenge: '/api/admin/challenges/:id/hide',
  unhideChallenge: '/api/admin/challenges/:id/unhide',
  applicants: '/api/admin/applicants',
  approveApplicant: '/api/admin/applicants/:id/approve',
  rejectApplicant: '/api/admin/applicants/:id/reject',
  invites: '/api/admin/invites',
  invite: '/api/admin/invites/:id',
  revokeInvite: '/api/admin/invites/:id/revoke',
  inviteEventBadge: '/api/admin/invites/:id/event-badge',
  whitelist: '/api/admin/whitelist',
  outbox: '/api/admin/outbox',
  presentation: '/api/admin/presentation',
  moderationReports: '/api/admin/reports',
  reportCount: '/api/admin/reports/count',
  dismissReport: '/api/admin/reports/dismiss',
  memberReports: '/api/admin/reports/:memberId',
  hideRequestNote: '/api/admin/requests/:id/hide-note',
  unhideRequestNote: '/api/admin/requests/:id/unhide-note',
  settings: '/api/admin/settings',
  setting: '/api/admin/settings/:key',
} as const

/** One of the endpoint patterns in `apiPaths`. */
export type ApiPath = (typeof apiPaths)[keyof typeof apiPaths]

/** The `:name` parameters a pattern declares, read from its text. */
export type PathParams<P extends string> =
  P extends `${string}:${infer Name}/${infer Rest}`
    ? Name | PathParams<Rest>
    : P extends `${string}:${infer Name}`
      ? Name
      : never

const PARAM = /:(\w+)/g

/** The concrete path for a pattern, each parameter URI-encoded. */
export function fill<P extends ApiPath>(
  pattern: P,
  params: Record<PathParams<P>, string>,
): string {
  const values: Record<string, string> = params
  return pattern.replace(PARAM, (_match, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`no value for :${name}`)
    return encodeURIComponent(value)
  })
}
