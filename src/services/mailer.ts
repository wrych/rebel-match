import { randomUUID } from 'node:crypto'

export type OutboxKind =
  'magic_link' | 'approval' | 'connection_request' | 'admin_notice'

export type DeliveryStatus = 'sent' | 'suppressed' | 'failed'

/** A message to send. `credential` is any string in the body that signs
 * someone in; it is what redaction removes (R-MSG-4). */
export interface OutboundMessage {
  memberId: string | null
  /** A member the body quotes, erased with them (R-MSG-6). */
  aboutMemberId?: string
  to: string
  kind: OutboxKind
  subject: string
  text: string
  credential?: string
}

/** What the outbound log stores before anything is sent (R-MSG-1, R-MSG-2). */
export interface OutboxEntry {
  id: string
  memberId: string | null
  aboutMemberId: string | null
  to: string
  kind: OutboxKind
  subject: string
  bodyText: string
}

export interface OutboxStore {
  record(entry: OutboxEntry): Promise<void>
  markSent(id: string, at: Date): Promise<void>
  markSuppressed(id: string): Promise<void>
  markFailed(id: string, error: string): Promise<void>
}

export interface MailTransport {
  send(mail: {
    from: string
    to: string
    subject: string
    text: string
  }): Promise<void>
}

export interface MailerDeps {
  store: OutboxStore
  /** Null when delivery is off: messages are recorded and suppressed. */
  transport: MailTransport | null
  from: string
  /** True only in a development deployment (R-DEV-1). */
  keepCredentials: boolean
  now?: () => Date
}

export interface Mailer {
  send(message: OutboundMessage): Promise<DeliveryStatus>
}

export const REDACTED = '[sign-in link removed from the log]'
// The width of outbox.error (migrations/005_outbox.sql). A schema fact, not a
// tunable: config could only make it disagree with the column.
const ERROR_MAX_CHARS = 500

/** The text with every occurrence of the credential replaced (R-MSG-4). */
export function redact(text: string, credential: string | undefined): string {
  return credential === undefined || credential === ''
    ? text
    : text.split(credential).join(REDACTED)
}

/** A transport error as it may be stored: credential removed, cut to fit the
 * column (R-MSG-7). */
export function storableError(error: unknown, credential?: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return redact(message, credential).slice(0, ERROR_MAX_CHARS)
}

async function deliver(
  deps: MailerDeps,
  transport: MailTransport,
  id: string,
  message: OutboundMessage,
): Promise<DeliveryStatus> {
  try {
    await transport.send({
      from: deps.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    })
  } catch (error) {
    await deps.store.markFailed(id, storableError(error, message.credential))
    return 'failed'
  }
  await deps.store.markSent(id, (deps.now ?? (() => new Date()))())
  return 'sent'
}

/** Records every message before handing it to the transport, then records
 * what happened: sent, suppressed or failed (R-MSG-1..3, design §1). */
export function createMailer(deps: MailerDeps): Mailer {
  return {
    send: async (message) => {
      const id = randomUUID()
      const bodyText = deps.keepCredentials
        ? message.text
        : redact(message.text, message.credential)
      await deps.store.record({
        id,
        memberId: message.memberId,
        aboutMemberId: message.aboutMemberId ?? null,
        to: message.to,
        kind: message.kind,
        subject: message.subject,
        bodyText,
      })

      if (deps.transport === null) {
        await deps.store.markSuppressed(id)
        return 'suppressed'
      }
      return deliver(deps, deps.transport, id, message)
    },
  }
}
