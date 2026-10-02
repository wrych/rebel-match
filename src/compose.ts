import {
  createAuth,
  createMysqlAuthStore,
  type AuthProvider,
} from './auth/index.js'
import { isDevelopmentDeployment, type Config } from './config.js'
import type { Pool } from './db.js'
import { mailLinks } from './services/link-delivery.js'
import { createMailer } from './services/mailer.js'
import { createMysqlOutboxStore } from './services/outbox-store.js'
import { createTransport } from './services/smtp.js'

/** The auth seam wired to MySQL and the mailer, as every entry point uses it. */
export function composeAuth(config: Config, pool: Pool): AuthProvider {
  const mailer = createMailer({
    store: createMysqlOutboxStore(pool),
    transport: createTransport(config.mail),
    from: config.mail.from,
    keepCredentials: isDevelopmentDeployment(config),
  })

  return createAuth({
    store: createMysqlAuthStore(pool),
    deliver: mailLinks(mailer),
    config,
  })
}
