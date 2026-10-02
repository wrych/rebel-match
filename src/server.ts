/* eslint-disable no-console -- the process entry reports where it is listening;
   the rule exists to keep member data out of logs, and a port is not that. */
import { createApp } from './app.js'
import { createAuth, createMysqlAuthStore } from './auth/index.js'
import { isDevelopmentDeployment, loadConfig } from './config.js'
import { createPool } from './db.js'
import { mailLinks } from './services/link-delivery.js'
import { createMailer } from './services/mailer.js'
import { createMysqlMemberProfiles } from './services/member-profiles.js'
import { createMysqlOutboxStore } from './services/outbox-store.js'
import { createTransport } from './services/smtp.js'

const config = loadConfig()
const pool = createPool(config)
const mailer = createMailer({
  store: createMysqlOutboxStore(pool),
  transport: createTransport(config.mail),
  from: config.mail.from,
  keepCredentials: isDevelopmentDeployment(config),
})
const auth = createAuth({
  store: createMysqlAuthStore(pool),
  deliver: mailLinks(mailer),
  config,
})
const profiles = createMysqlMemberProfiles(pool)

createApp({ config, pool, auth, profiles }).listen(config.port, () => {
  console.log(`rebel-match server on http://localhost:${String(config.port)}`)
  console.log(`  mail delivery: ${config.mail.delivery}`)
  console.log(`  seed profile:  ${config.seedProfile}`)
})
