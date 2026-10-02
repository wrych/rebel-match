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

/** Reading and ageing out the outbound message log. */
export interface OutboxLog {
  list(filter: OutboxFilter): Promise<OutboxRow[]>
  /** Deletes entries created before `cutoff`; returns how many went. */
  purgeBefore(cutoff: Date): Promise<number>
}

const MS_PER_DAY = 86_400_000

/** The oldest moment an entry may have been created and still be kept. */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * MS_PER_DAY)
}
