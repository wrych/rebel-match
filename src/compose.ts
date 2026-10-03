import {
  createAuth,
  createMysqlAuthStore,
  type AuthProvider,
  type OutgoingLink,
} from './auth/index.js'
import { admittedRole } from './access.js'
import type { AppDeps } from './app.js'
import { isDevelopmentDeployment, type Config } from './config.js'
import type { Pool } from './db.js'
import {
  createMysqlAdmissionStore,
  createMysqlReviewerDirectory,
} from './services/admission-store.js'
import { createAdmission } from './services/admission.js'
import { createApplicantHandles } from './services/applicant-handle.js'
import { createApplicantNotice } from './services/applicant-notice.js'
import { createMysqlApprovalStore } from './services/approval-store.js'
import { createApprovals } from './services/approvals.js'
import { mailLinks } from './services/link-delivery.js'
import { createMailer, type Mailer } from './services/mailer.js'
import { createMysqlMemberProfiles } from './services/member-profiles.js'
import { createMysqlOutboxLog } from './services/outbox-log-store.js'
import { createMysqlOutboxStore } from './services/outbox-store.js'
import { createMysqlRoleGrantStore } from './services/role-grant-store.js'
import { createRoleService } from './services/roles.js'
import { createTransport } from './services/smtp.js'
import { configPolicy } from './permissions.js'

/** The mailer every entry point uses: records to the outbound log, then
 * delivers per configuration (design §1). */
export function composeMailer(config: Config, pool: Pool): Mailer {
  return createMailer({
    store: createMysqlOutboxStore(pool),
    transport: createTransport(config.mail),
    from: config.mail.from,
    keepCredentials: isDevelopmentDeployment(config),
  })
}

/** The auth seam wired to MySQL and a mailer, as every entry point uses it.
 * `onSent` sees each link after the mailer has recorded it. */
export function composeAuth(
  config: Config,
  pool: Pool,
  mailer: Mailer,
  onSent?: (link: OutgoingLink) => void,
): AuthProvider {
  const deliver = mailLinks(mailer)

  return createAuth({
    policy: configPolicy,
    store: createMysqlAuthStore(pool),
    deliver: async (link) => {
      await deliver(link)
      onSent?.(link)
    },
    config,
  })
}

/** Every service the app serves, wired to MySQL: the server and the
 * integration tests build the same thing, so a test cannot pass on wiring the
 * server lacks. */
export function composeApp(config: Config, pool: Pool): AppDeps {
  const mailer = composeMailer(config, pool)
  const auth = composeAuth(config, pool, mailer)

  return {
    config,
    pool,
    auth,
    profiles: createMysqlMemberProfiles(pool),
    roles: createRoleService({
      store: createMysqlRoleGrantStore(pool),
      policy: configPolicy,
    }),
    outbox: createMysqlOutboxLog(pool),
    admission: createAdmission({
      store: createMysqlAdmissionStore(pool),
      auth,
      handles: createApplicantHandles(config.sessionSecret),
      notifyReviewers: createApplicantNotice({
        mailer,
        reviewers: createMysqlReviewerDirectory(pool),
        reviewerRoles: configPolicy.rolesGranting('applicant:review'),
        publicUrl: config.publicUrl,
      }),
    }),
    approvals: createApprovals({
      store: createMysqlApprovalStore(pool),
      auth,
      admittedRole,
    }),
  }
}
