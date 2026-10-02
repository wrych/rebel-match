import type { OutboxKind } from './mailer.js'

export type OutboxStatus = 'recorded' | 'sent' | 'suppressed' | 'failed'

/** One line of the outbound message log as an admin sees it (R-MSG-5). The
 * body is as stored: its credential is already redacted outside a development
 * deployment (R-MSG-4). */
export interface OutboxRow {
  id: string
  to: string
  kind: OutboxKind
  subject: string
  bodyText: string
  status: OutboxStatus
  error: string | null
  createdAt: Date
  sentAt: Date | null
}

export interface OutboxFilter {
  to?: string | undefined
  status?: OutboxStatus | undefined
  limit: number
}

/** Reading the outbound message log. */
export interface OutboxLog {
  list(filter: OutboxFilter): Promise<OutboxRow[]>
}
