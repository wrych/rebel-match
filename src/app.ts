import express, { type ErrorRequestHandler, type Express } from 'express'
import { ZodError } from 'zod'
import type { AuthProvider } from './auth/index.js'
import { clientConfig, type Config } from './config.js'
import { sql } from 'drizzle-orm'
import type { Database } from './db/connect.js'
import { challengeRoutes } from './routes/challenges.js'
import { clientShellRoutes } from './routes/client-shell.js'
import { connectionRoutes } from './routes/connections.js'
import { deckRoutes } from './routes/deck.js'
import { activityRoutes } from './routes/activity.js'
import { swipeRoutes } from './routes/swipes.js'
import { cockpitRoutes } from './routes/cockpit.js'
import { guardApi } from './routes/api-guard.js'
import { adminApplicantRoutes } from './routes/admin-applicants.js'
import { adminInviteRoutes } from './routes/admin-invites.js'
import { adminOutboxRoutes } from './routes/admin-outbox.js'
import { adminSettingsRoutes } from './routes/admin-settings.js'
import { adminMemberRoutes } from './routes/admin-members.js'
import { adminRoleRoutes } from './routes/admin-roles.js'
import { adminWhitelistRoutes } from './routes/admin-whitelist.js'
import { securityHeaders } from './security-headers.js'
import { authRoutes, renewSessions } from './routes/auth.js'
import { onboardingRoutes } from './routes/onboarding.js'
import { analyticsConsentRoutes } from './routes/analytics-consent.js'
import { eventRoutes } from './routes/events.js'
import { profileRoutes } from './routes/profile.js'
import { requestLinkRoutes } from './routes/request-link.js'
import { limitPerIp, SIGN_IN_POSTS } from './routes/ip-limit.js'
import { createWindowCounter } from './services/rate-limit.js'
import type { AdmissionService } from './services/admission.js'
import type { ApprovalService } from './services/approvals.js'
import type { ChallengeService } from './services/challenges.js'
import type { ConnectionService } from './services/connections.js'
import type { DeckService } from './services/deck.js'
import type { ActivityService } from './services/activity.js'
import type { SwipeService } from './services/swipes.js'
import type { CockpitService } from './services/cockpit.js'
import type { FollowService } from './services/follows.js'
import type { InviteService } from './services/invites.js'
import type { OnboardingService } from './services/onboarding.js'
import type { MemberProfiles } from './services/member-profiles.js'
import type { OutboxLog } from './services/outbox-log.js'
import type { AnalyticsConsentService } from './services/analytics-consent.js'
import type { Track } from './services/analytics.js'
import type { ErasureService } from './services/erasure.js'
import type { MemberRoster } from './services/member-roster.js'
import type { ProfileStore } from './services/profile.js'
import type { RoleService } from './services/roles.js'
import type { WhitelistService } from './services/whitelist.js'
import type { SettingsService } from './services/settings.js'
import type { NotificationService } from './services/notifications.js'
import type { NotificationSettingsService } from './services/notification-settings.js'
import { notificationRoutes } from './routes/notifications.js'

export interface AppDeps {
  config: Config
  settings: SettingsService
  db: Database
  auth: AuthProvider
  profiles: MemberProfiles
  roles: RoleService
  erasure: ErasureService
  roster: MemberRoster
  profile: ProfileStore
  whitelist: WhitelistService
  outbox: OutboxLog
  admission: AdmissionService
  approvals: ApprovalService
  onboarding: OnboardingService
  analyticsConsent: AnalyticsConsentService
  track: Track
  invites: InviteService
  challenges: ChallengeService
  deck: DeckService
  activity: ActivityService
  connections: ConnectionService
  swipes: SwipeService
  follows: FollowService
  cockpit: CockpitService
  notifications: NotificationService
  notificationSettings: NotificationSettingsService
  /** Mails notifications and purges old ones; run by the server's timers,
   * not by requests (R-NOTE-7, R-NOTE-11). */
  notificationMail: {
    deliverDue(): Promise<void>
    purgeBefore(cutoff: Date): Promise<number>
  }
}

/** True when the database answers. Reported rather than thrown, so a dev server
 * still starts and says what is wrong. */
async function databaseReachable(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`)
    return true
  } catch {
    return false
  }
}

/**
 * Never let an internal message reach a client: it can carry a query, a path or a
 * member's data (constitution §5). A client error, or a request failing a route's
 * validation, answers 4xx; everything else is a 500. The status is the whole response.
 */
export const handleErrors: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const status =
    error instanceof ZodError
      ? 400
      : (error as { status?: unknown } | null)?.status
  const clientError =
    typeof status === 'number' && status >= 400 && status < 500

  response
    .status(clientError ? status : 500)
    .json({ error: clientError ? 'bad_request' : 'internal_error' })
}

/** Builds the app from injected dependencies, so tests can supply fakes
 * (constitution §4). */
export function createApp(deps: AppDeps): Express {
  const app = express()

  app.set('trust proxy', deps.config.trustProxy)
  app.use(securityHeaders(deps.config))
  app.post(
    [...SIGN_IN_POSTS],
    limitPerIp(
      createWindowCounter({
        windowMinutes: () => deps.settings.abuse().ipWindowMinutes,
      }),
      () => deps.settings.abuse().authRequestsPerIp,
    ),
  )
  app.use(express.json({ limit: '64kb' }))
  app.use(renewSessions(deps.auth))
  app.use(authRoutes(deps))
  app.use(requestLinkRoutes(deps))
  app.use('/api', guardApi(deps))
  app.use(onboardingRoutes(deps))
  app.use(analyticsConsentRoutes(deps))
  app.use(eventRoutes(deps))
  app.use(profileRoutes(deps))
  app.use(challengeRoutes(deps))
  app.use(deckRoutes(deps), activityRoutes(deps))
  app.use(connectionRoutes(deps))
  app.use(swipeRoutes(deps))
  app.use(cockpitRoutes(deps), notificationRoutes(deps))
  app.use(adminRoleRoutes(deps))
  app.use(adminMemberRoutes(deps))
  app.use(adminWhitelistRoutes(deps))
  app.use(adminApplicantRoutes(deps))
  app.use(adminInviteRoutes(deps))
  app.use(adminOutboxRoutes(deps))
  app.use(adminSettingsRoutes(deps))

  app.get('/api/health', async (_request, response) => {
    const database = (await databaseReachable(deps.db)) ? 'up' : 'down'

    response.json({ status: 'ok', database })
  })

  app.get('/api/config', (_request, response) => {
    response.json(clientConfig(deps.config, deps.settings.limits()))
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'not_found' })
  })

  if (deps.config.clientDir !== undefined) {
    app.use(clientShellRoutes(deps.config.clientDir))
  }

  app.use(handleErrors)

  return app
}
