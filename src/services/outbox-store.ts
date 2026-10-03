import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { outbox } from '../db/schema.js'
import type { OutboxStore } from './mailer.js'

/** The outbound message log over Postgres (design §2 `outbox`). */
export function createOutboxStore(db: Database): OutboxStore {
  return {
    record: async (entry) => {
      await db.insert(outbox).values({
        id: entry.id,
        memberId: entry.memberId,
        toEmail: entry.to,
        kind: entry.kind,
        subject: entry.subject,
        bodyText: entry.bodyText,
      })
    },
    markSent: async (id, at) => {
      await db
        .update(outbox)
        .set({ status: 'sent', sentAt: at })
        .where(eq(outbox.id, id))
    },
    markSuppressed: async (id) => {
      await db
        .update(outbox)
        .set({ status: 'suppressed' })
        .where(eq(outbox.id, id))
    },
    markFailed: async (id, error) => {
      await db
        .update(outbox)
        .set({ status: 'failed', error })
        .where(eq(outbox.id, id))
    },
  }
}
