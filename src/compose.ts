import {
  createAuth,
  createMysqlAuthStore,
  type AuthProvider,
  type OutgoingLink,
} from './auth/index.js'
import { isDevelopmentDeployment, type Config } from './config.js'
import type { Pool } from './db.js'
import { mailLinks } from './services/link-delivery.js'
import { createMailer, type Mailer } from './services/mailer.js'
import { createMysqlOutboxStore } from './services/outbox-store.js'
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
