import { and, desc, eq, lt, type SQL } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { outbox } from '../db/schema.js'
import type { OutboxLog } from './outbox-log.js'

/** The outbound message log over Postgres, newest first. */
export function createOutboxLog(db: Database): OutboxLog {
  return {
    list: async (filter) => {
      const conditions: SQL[] = []
      if (filter.to !== undefined)
        conditions.push(eq(outbox.toEmail, filter.to))
      if (filter.status !== undefined)
        conditions.push(eq(outbox.status, filter.status))
      const rows = await db
        .select()
        .from(outbox)
        .where(and(...conditions))
        .orderBy(desc(outbox.createdAt), desc(outbox.id))
        .limit(filter.limit)
      return rows.map((row) => ({
        id: row.id,
        to: row.toEmail,
        kind: row.kind,
        subject: row.subject,
        bodyText: row.bodyText,
        status: row.status,
        error: row.error,
        createdAt: row.createdAt,
        sentAt: row.sentAt,
      }))
    },
    purgeBefore: async (cutoff) => {
      const purged = await db
        .delete(outbox)
        .where(lt(outbox.createdAt, cutoff))
        .returning({ id: outbox.id })
      return purged.length
    },
  }
}
