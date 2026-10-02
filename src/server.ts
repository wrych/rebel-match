/* eslint-disable no-console -- the process entry reports where it is listening;
   the rule exists to keep member data out of logs, and a port is not that. */
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createPool } from './db.js'

const config = loadConfig()
const pool = createPool(config)

createApp({ config, pool }).listen(config.port, () => {
  console.log(`rebel-match server on http://localhost:${String(config.port)}`)
  console.log(`  mail delivery: ${config.mail.delivery}`)
  console.log(`  seed profile:  ${config.seedProfile}`)
})
