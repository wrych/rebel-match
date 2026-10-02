import {
  createAuth,
  createMysqlAuthStore,
  type AuthProvider,
  type OutgoingLink,
} from './auth/index.js'
import { isDevelopmentDeployment, type Config } from './config.js'
import type { Pool } from './db.js'
import { mailLinks } from './services/link-delivery.js'
import { createMailer } from './services/mailer.js'
import { createMysqlOutboxStore } from './services/outbox-store.js'
import { createTransport } from './services/smtp.js'
import { configPolicy } from './permissions.js'

/** The auth seam wired to MySQL and the mailer, as every entry point uses it.
 * `onSent` sees each link after the mailer has recorded it. */
export function composeAuth(
  config: Config,
  pool: Pool,
  onSent?: (link: OutgoingLink) => void,
): AuthProvider {
  const mailer = createMailer({
    store: createMysqlOutboxStore(pool),
    transport: createTransport(config.mail),
    from: config.mail.from,
    keepCredentials: isDevelopmentDeployment(config),
  })

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
