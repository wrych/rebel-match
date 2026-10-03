import { randomUUID } from 'node:crypto'
import {
  createAuth,
  createAuthStore,
  type AuthProvider,
  type OutgoingLink,
} from './auth/index.js'
import { admittedRole } from './access.js'
import type { AppDeps } from './app.js'
import { isDevelopmentDeployment, type Config } from './config.js'
import type { Database } from './db/connect.js'
import {
  createAdmissionStore,
  createReviewerDirectory,
} from './services/admission-store.js'
import { createAdmission } from './services/admission.js'
import { createApplicantHandles } from './services/applicant-handle.js'
import { createApplicantNotice } from './services/applicant-notice.js'
import { createApprovalStore } from './services/approval-store.js'
import { createApprovals } from './services/approvals.js'
import { mailLinks } from './services/link-delivery.js'
import { createChallengeStore } from './services/challenge-store.js'
import { createChallenges } from './services/challenges.js'
import { createConnectionStore } from './services/connection-store.js'
import { createConnections } from './services/connections.js'
import { createSwipeStore } from './services/swipe-store.js'
import { createSwipes } from './services/swipes.js'
import {
  createCockpitStore,
  createFollowStore,
} from './services/cockpit-store.js'
import { createCockpit } from './services/cockpit.js'
import { createFollows } from './services/follows.js'
import { createDeckStore } from './services/deck-store.js'
import { createDeck } from './services/deck.js'
import { createInviteRedemption } from './services/invite-redemption-store.js'
import { createInviteStore } from './services/invite-store.js'
import { createInvites } from './services/invites.js'
import { createMailer, type Mailer } from './services/mailer.js'
import { createMemberProfiles } from './services/member-profiles.js'
import { createOnboardingStore } from './services/onboarding-store.js'
import { createOnboarding } from './services/onboarding.js'
import { createOutboxLog } from './services/outbox-log-store.js'
import { createOutboxStore } from './services/outbox-store.js'
import { createErasureService } from './services/erasure.js'
import { createErasureStore } from './services/erasure-store.js'
import { createRoleGrantStore } from './services/role-grant-store.js'
import { createRoleService } from './services/roles.js'
import { createTransport } from './services/smtp.js'
import { configPolicy } from './permissions.js'

/** The mailer every entry point uses: records to the outbound log, then
 * delivers per configuration (design §1). */
export function composeMailer(config: Config, db: Database): Mailer {
  return createMailer({
    store: createOutboxStore(db),
    transport: createTransport(config.mail),
    from: config.mail.from,
    keepCredentials: isDevelopmentDeployment(config),
  })
}

/** The auth seam wired to the database and a mailer, as every entry point uses it.
 * `onSent` sees each link after the mailer has recorded it. */
export function composeAuth(
  config: Config,
  db: Database,
  mailer: Mailer,
  onSent?: (link: OutgoingLink) => void,
): AuthProvider {
  const deliver = mailLinks(mailer)

  return createAuth({
    policy: configPolicy,
    store: createAuthStore(db),
    deliver: async (link) => {
      await deliver(link)
      onSent?.(link)
    },
    config,
  })
}

// The member journeys: asking, offering and connecting (F5, F6, F7).
function composeJourneys(
  config: Config,
  db: Database,
): Pick<
  AppDeps,
  'challenges' | 'deck' | 'connections' | 'swipes' | 'follows' | 'cockpit'
> {
  const challenges = createChallenges({
    store: createChallengeStore(db),
  })
  const follows = createFollows({
    store: createFollowStore(db),
    trends: () => challenges.trends(),
  })
  const connections = createConnections({
    store: createConnectionStore(db),
    newId: randomUUID,
  })
  return {
    challenges,
    deck: createDeck({
      store: createDeckStore(db),
      pageSize: config.limits.deckPageSize,
    }),
    connections,
    swipes: createSwipes({ store: createSwipeStore(db), connections }),
    follows,
    cockpit: createCockpit({
      store: createCockpitStore(db),
      followed: (memberId) => follows.followed(memberId),
    }),
  }
}

/** Every service the app serves, wired to the database: the server and the
 * integration tests build the same thing, so a test cannot pass on wiring the
 * server lacks. */
export function composeApp(config: Config, db: Database): AppDeps {
  const mailer = composeMailer(config, db)
  const auth = composeAuth(config, db, mailer)

  return {
    config,
    db,
    auth,
    profiles: createMemberProfiles(db, config.consentVersion),
    roles: createRoleService({
      store: createRoleGrantStore(db),
      policy: configPolicy,
    }),
    erasure: createErasureService({
      store: createErasureStore(db),
      policy: configPolicy,
    }),
    outbox: createOutboxLog(db),
    admission: createAdmission({
      store: createAdmissionStore(db),
      auth,
      handles: createApplicantHandles(config.sessionSecret),
      redeemInvite: createInviteRedemption(db, admittedRole),
      notifyReviewers: createApplicantNotice({
        mailer,
        reviewers: createReviewerDirectory(db),
        reviewerRoles: configPolicy.rolesGranting('applicant:review'),
        publicUrl: config.publicUrl,
      }),
    }),
    approvals: createApprovals({
      store: createApprovalStore(db),
      auth,
      admittedRole,
    }),
    onboarding: createOnboarding({
      store: createOnboardingStore(db),
      currentConsentVersion: config.consentVersion,
    }),
    invites: createInvites({
      store: createInviteStore(db),
      publicUrl: config.publicUrl,
      defaults: config.limits,
      newId: randomUUID,
    }),
    ...composeJourneys(config, db),
  }
}
