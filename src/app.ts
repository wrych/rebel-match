import express, { type ErrorRequestHandler, type Express } from 'express'
import type { AuthProvider } from './auth/index.js'
import { clientConfig, type Config } from './config.js'
import { sql } from 'drizzle-orm'
import type { Database } from './db/connect.js'
import { challengeRoutes } from './routes/challenges.js'
import { connectionRoutes } from './routes/connections.js'
import { deckRoutes } from './routes/deck.js'
import { swipeRoutes } from './routes/swipes.js'
import { cockpitRoutes } from './routes/cockpit.js'
import { guardApi } from './routes/api-guard.js'
import { adminApplicantRoutes } from './routes/admin-applicants.js'
import { adminInviteRoutes } from './routes/admin-invites.js'
import { adminOutboxRoutes } from './routes/admin-outbox.js'
import { adminRoleRoutes } from './routes/admin-roles.js'
import { authRoutes, renewSessions } from './routes/auth.js'
import { onboardingRoutes } from './routes/onboarding.js'
import { requestLinkRoutes } from './routes/request-link.js'
import type { AdmissionService } from './services/admission.js'
import type { ApprovalService } from './services/approvals.js'
import type { ChallengeService } from './services/challenges.js'
import type { ConnectionService } from './services/connections.js'
import type { DeckService } from './services/deck.js'
import type { SwipeService } from './services/swipes.js'
import type { Cockpit } from './services/cockpit.js'
import type { FollowService } from './services/follows.js'
import type { InviteService } from './services/invites.js'
import type { OnboardingService } from './services/onboarding.js'
import type { MemberProfiles } from './services/member-profiles.js'
import type { OutboxLog } from './services/outbox-log.js'
import type { RoleService } from './services/roles.js'

export interface AppDeps {
  config: Config
  db: Database
  auth: AuthProvider
  profiles: MemberProfiles
  roles: RoleService
  outbox: OutboxLog
  admission: AdmissionService
  approvals: ApprovalService
  onboarding: OnboardingService
  invites: InviteService
  challenges: ChallengeService
  deck: DeckService
  connections: ConnectionService
  swipes: SwipeService
  follows: FollowService
  cockpit: { cockpit(memberId: string): Promise<Cockpit> }
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
 * member's data (constitution §5). A client error keeps its 4xx status, which says
 * something about the caller's request and nothing about ours; everything else is
 * a 500. The status is the whole response.
 */
export const handleErrors: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const status = (error as { status?: unknown } | null)?.status
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

  app.disable('x-powered-by')
  app.use(express.json({ limit: '64kb' }))
  app.use(renewSessions(deps.auth))
  app.use(authRoutes(deps))
  app.use(requestLinkRoutes(deps))
  app.use('/api', guardApi(deps))
  app.use(onboardingRoutes(deps))
  app.use(challengeRoutes(deps))
  app.use(deckRoutes(deps))
  app.use(connectionRoutes(deps))
  app.use(swipeRoutes(deps))
  app.use(cockpitRoutes(deps))
  app.use(adminRoleRoutes(deps))
  app.use(adminApplicantRoutes(deps))
  app.use(adminInviteRoutes(deps))
  app.use(adminOutboxRoutes(deps))

  app.get('/api/health', async (_request, response) => {
    const database = (await databaseReachable(deps.db)) ? 'up' : 'down'

    response.json({ status: 'ok', database })
  })

  app.get('/api/config', (_request, response) => {
    response.json(clientConfig(deps.config))
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'not_found' })
  })

  app.use(handleErrors)

  return app
}
