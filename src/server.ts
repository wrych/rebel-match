/* eslint-disable no-console -- the process entry reports where it is listening;
   the rule exists to keep member data out of logs, and a port is not that. */
import { createApp } from './app.js'
import { composeAuth } from './compose.js'
import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { configPolicy } from './permissions.js'
import { createMysqlMemberProfiles } from './services/member-profiles.js'
import { createMysqlOutboxLog } from './services/outbox-log-store.js'
import { createMysqlRoleGrantStore } from './services/role-grant-store.js'
import { createRoleService } from './services/roles.js'

const config = loadConfig()
const pool = createPool(config)
const auth = composeAuth(config, pool)
const profiles = createMysqlMemberProfiles(pool)
const roles = createRoleService({
  store: createMysqlRoleGrantStore(pool),
  policy: configPolicy,
})
const outbox = createMysqlOutboxLog(pool)

createApp({ config, pool, auth, profiles, roles, outbox }).listen(
  config.port,
  () => {
    console.log(`rebel-match server on http://localhost:${String(config.port)}`)
    console.log(`  mail delivery: ${config.mail.delivery}`)
    console.log(`  seed profile:  ${config.seedProfile}`)
  },
)
