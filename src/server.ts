/* eslint-disable no-console -- the process entry reports where it is listening;
   the rule exists to keep member data out of logs, and a port is not that. */
import { createApp } from './app.js'
import { composeAuth, composeMailer } from './compose.js'
import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { configPolicy } from './permissions.js'
import {
  createMysqlAdmissionStore,
  createMysqlReviewerDirectory,
} from './services/admission-store.js'
import { createApplicantHandles } from './services/applicant-handle.js'
import { createAdmission } from './services/admission.js'
import { createApplicantNotice } from './services/applicant-notice.js'
import { createMysqlMemberProfiles } from './services/member-profiles.js'
import { createMysqlOutboxLog } from './services/outbox-log-store.js'
import { startOutboxRetention } from './services/outbox-retention.js'
import { createMysqlRoleGrantStore } from './services/role-grant-store.js'
import { createRoleService } from './services/roles.js'

const config = loadConfig()
const pool = createPool(config)
const mailer = composeMailer(config, pool)
const auth = composeAuth(config, pool, mailer)
const profiles = createMysqlMemberProfiles(pool)
const roles = createRoleService({
  store: createMysqlRoleGrantStore(pool),
  policy: configPolicy,
})
const outbox = createMysqlOutboxLog(pool)
const admission = createAdmission({
  store: createMysqlAdmissionStore(pool),
  handles: createApplicantHandles(config.sessionSecret),
  auth,
  notifyReviewers: createApplicantNotice({
    mailer,
    reviewers: createMysqlReviewerDirectory(pool),
    reviewerRoles: configPolicy.rolesGranting('applicant:review'),
    publicUrl: config.publicUrl,
  }),
})

startOutboxRetention({
  log: outbox,
  retentionDays: config.limits.outboxRetentionDays,
  intervalHours: config.outboxPurgeIntervalHours,
  onError: () => {
    console.warn('outbox retention: purge failed, will retry next interval')
  },
})

createApp({ config, pool, auth, profiles, roles, outbox, admission }).listen(
  config.port,
  () => {
    console.log(`rebel-match server on http://localhost:${String(config.port)}`)
    console.log(`  mail delivery: ${config.mail.delivery}`)
    console.log(`  seed profile:  ${config.seedProfile}`)
  },
)
