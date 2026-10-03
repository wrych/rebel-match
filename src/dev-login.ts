import type { OutgoingLink } from './auth/index.js'
import { composeAuth, composeMailer } from './compose.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/open.js'
import {
  devLoginRefusal,
  seededMember,
  signInBanner,
} from './dev-login/guard.js'
import { DEV_ADMIN_EMAIL } from './seed/dev/people.js'

const config = loadConfig()
const email = process.argv[2] ?? DEV_ADMIN_EMAIL
const refusal = devLoginRefusal(config)
const member = refusal === null ? seededMember(config, email) : null

if (refusal !== null || member === null) {
  process.stderr.write(
    `dev:login: refused — ${refusal ?? 'not a member of the dev seed'}\n`,
  )
  process.exit(1)
}

const connection = await openDatabase(config)
let issued: OutgoingLink | undefined

try {
  const auth = composeAuth(
    config,
    connection.db,
    composeMailer(config, connection.db),
    (link) => {
      issued = link
    },
  )
  await auth.issueLink(member.email, { kind: 'self_service' })
  if (issued !== undefined) {
    process.stdout.write(`${signInBanner(issued.url, member.roles)}\n`)
  }
} finally {
  await connection.close()
}
