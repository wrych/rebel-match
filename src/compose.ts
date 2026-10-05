import { randomUUID } from 'node:crypto'
import {
  createAuth,
  createAuthStore,
  type AuthProvider,
  type OutgoingLink,
} from './auth/index.js'
import { admittedRole } from './access.js'
import type { AppDeps } from './app.js'
import {
  isDevelopmentDeployment,
  type AbuseLimits,
  type Config,
  type LiveSettings,
} from './config.js'
import type { Database } from './db/connect.js'
import {
  createAdmissionStore,
  createReviewerDirectory,
} from './services/admission-store.js'
import { createAdmission } from './services/admission.js'
import { createApplicantHandles } from './services/applicant-handle.js'
import { createHumanCheck } from './services/human-check.js'
import { createPacedGate, type PacedGate } from './services/paced-gate.js'
import { createSettingOverrideStore } from './services/setting-override-store.js'
import { createSettings } from './services/settings.js'
import { createWindowCounter } from './services/rate-limit.js'
import { createApplicantNotice } from './services/applicant-notice.js'
import { createApprovalStore } from './services/approval-store.js'
import { createApprovals } from './services/approvals.js'
import { mailLinks } from './services/link-delivery.js'
import { createChallengeStore } from './services/challenge-store.js'
import { createChallenges } from './services/challenges.js'
import { createConnectionStore } from './services/connection-store.js'
import { createConnections } from './services/connections.js'
import {
  createAcceptNotice,
  createAddedNotice,
  createConnectionNotice,
} from './services/connection-notice.js'
import { createMemberDirectory } from './services/member-directory-store.js'
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
import { createActivity } from './services/activity.js'
import { createActivityStore } from './services/activity-store.js'
import { createInviteRedemption } from './services/invite-redemption-store.js'
import { createInviteStore } from './services/invite-store.js'
import { createInvites } from './services/invites.js'
import { createMailer, type Mailer } from './services/mailer.js'
import { createMemberProfiles } from './services/member-profiles.js'
import {
  createTracker,
  trackNothing,
  type Track,
} from './services/analytics.js'
import { createAnalyticsIds } from './services/analytics-ids-store.js'
import { createMixpanelSink } from './services/mixpanel-sink.js'
import { createAnalyticsConsent } from './services/analytics-consent.js'
import { createAnalyticsConsentStore } from './services/analytics-consent-store.js'
import { createOnboardingStore } from './services/onboarding-store.js'
import { createOnboarding } from './services/onboarding.js'
import { createOutboxLog } from './services/outbox-log-store.js'
import { createOutboxStore } from './services/outbox-store.js'
import { createErasureService } from './services/erasure.js'
import { createErasureStore } from './services/erasure-store.js'
import { createMemberRoster } from './services/member-roster-store.js'
import { createProfileStore } from './services/profile-store.js'
import { createWhitelist } from './services/whitelist.js'
import { createWhitelistStore } from './services/whitelist-store.js'
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
  track: Track,
  mailer: Mailer,
): Pick<
  AppDeps,
  'challenges' | 'deck' | 'connections' | 'swipes' | 'follows' | 'cockpit'
> {
  const challenges = createChallenges({
    store: createChallengeStore(db),
    track,
  })
  const follows = createFollows({
    store: createFollowStore(db),
    trends: () => challenges.trends(),
  })
  const notices = {
    mailer,
    members: createMemberDirectory(db),
    publicUrl: config.publicUrl,
  }
  const connections = createConnections({
    store: createConnectionStore(db),
    newId: randomUUID,
    track,
    notify: createConnectionNotice(notices),
    notifyAccepted: createAcceptNotice(notices),
    notifyAdded: createAddedNotice(notices),
  })
  return {
    challenges,
    deck: createDeck({
      store: createDeckStore(db),
      pageSize: config.limits.deckPageSize,
    }),
    connections,
    swipes: createSwipes({ store: createSwipeStore(db), connections, track }),
    follows,
    cockpit: createCockpit({
      store: createCockpitStore(db),
      followed: (memberId) => follows.followed(memberId),
    }),
  }
}

function composeMembershipAdmin(
  config: Config,
  db: Database,
  auth: AuthProvider,
): Pick<AppDeps, 'roles' | 'erasure' | 'roster' | 'whitelist'> {
  return {
    roles: createRoleService({
      store: createRoleGrantStore(db),
      policy: configPolicy,
    }),
    erasure: createErasureService({
      store: createErasureStore(db),
      policy: configPolicy,
      graceDays: () => config.limits.erasureGraceDays,
    }),
    roster: createMemberRoster(db, config.analyticsVersion),
    whitelist: createWhitelist({
      store: createWhitelistStore(db),
      auth,
      admittedRole,
    }),
  }
}

// The pace of sign-in emails per address and of applicants per network
// (R-NFR-8, ADR 0029), read from the settings on every use (ADR 0031).
function composeGates(
  config: Config,
  settings: LiveSettings,
): { applicants: PacedGate; linkEmails: PacedGate } {
  const abuse = (): AbuseLimits => settings.abuse()
  const humanCheck = createHumanCheck({
    secret: config.sessionSecret,
    limits: () => ({
      cost: abuse().humanCheckCost,
      lifetimeMinutes: abuse().humanCheckMinutes,
    }),
  })
  return {
    applicants: createPacedGate({
      counter: createWindowCounter({
        windowMinutes: () => abuse().applicantWindowMinutes,
      }),
      humanCheck,
      limits: () => ({
        freeUses: abuse().applicantsBeforeCheck,
        ceiling: abuse().applicantsCeiling,
      }),
    }),
    linkEmails: createPacedGate({
      counter: createWindowCounter({
        windowMinutes: () => abuse().linkEmailWindowMinutes,
      }),
      humanCheck,
      limits: () => ({
        freeUses: abuse().linkEmailsBeforeCheck,
        ceiling: abuse().linkEmailsCeiling,
      }),
    }),
  }
}

// Who gets in: applicants at the door, invites, and the hosts' approvals
// (F4, F10, F15).
function composeAdmission(
  config: Config,
  settings: LiveSettings,
  db: Database,
  auth: AuthProvider,
  mailer: Mailer,
): Pick<AppDeps, 'admission' | 'approvals'> {
  return {
    admission: createAdmission({
      store: createAdmissionStore(db),
      auth,
      handles: createApplicantHandles(config.sessionSecret),
      ...composeGates(config, settings),
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
  }
}

// Analytics goes to Mixpanel only with a token, and only for opted-in members
// (ADR 0026); without a token nothing is sent.
function composeTrack(
  config: Config,
  db: Database,
  onError: (error: unknown) => void,
): Track {
  const { token, apiHost } = config.analytics
  if (token === undefined) return trackNothing
  return createTracker({
    ids: createAnalyticsIds(db, config.analyticsVersion),
    sink: createMixpanelSink({ token, apiHost }),
    onError,
  })
}

const ignoreError = (): void => undefined

/** Every service the app serves, wired to the database: the server and the
 * integration tests build the same thing, so a test cannot pass on wiring the
 * server lacks. `onAnalyticsError` hears of an event that could not be sent. */
export function composeApp(
  config: Config,
  db: Database,
  hooks: { onAnalyticsError?: (error: unknown) => void } = {},
): AppDeps {
  const mailer = composeMailer(config, db)
  const auth = composeAuth(config, db, mailer)
  const track = composeTrack(config, db, hooks.onAnalyticsError ?? ignoreError)
  const settings = createSettings({
    config,
    store: createSettingOverrideStore(db),
  })

  return {
    config,
    settings,
    db,
    track,
    auth,
    profiles: createMemberProfiles(db, {
      consentVersion: config.consentVersion,
      analyticsVersion: config.analyticsVersion,
    }),
    profile: createProfileStore(db, config.analyticsVersion),
    ...composeMembershipAdmin(config, db, auth),
    outbox: createOutboxLog(db),
    ...composeAdmission(config, settings, db, auth, mailer),
    onboarding: createOnboarding({
      store: createOnboardingStore(db),
      currentConsentVersion: config.consentVersion,
      currentAnalyticsVersion: config.analyticsVersion,
    }),
    analyticsConsent: createAnalyticsConsent({
      store: createAnalyticsConsentStore(db),
      currentVersion: config.analyticsVersion,
    }),
    invites: createInvites({
      store: createInviteStore(db),
      publicUrl: config.publicUrl,
      defaults: () => settings.limits(),
      newId: randomUUID,
    }),
    activity: createActivity({
      store: createActivityStore(db),
      newId: randomUUID,
    }),
    ...composeJourneys(config, db, track, mailer),
  }
}
