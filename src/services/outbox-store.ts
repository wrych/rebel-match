import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { outbox, outboxQuotes } from '../db/schema.js'
import type { OutboxStore } from './mailer.js'

/** The outbound message log over Postgres (design §2 `outbox`). */
export function createOutboxStore(db: Database): OutboxStore {
  return {
    record: (entry) =>
      db.transaction(async (tx) => {
        await tx.insert(outbox).values({
          id: entry.id,
          memberId: entry.memberId,
          aboutMemberId: entry.aboutMemberId,
          toEmail: entry.to,
          kind: entry.kind,
          subject: entry.subject,
          bodyText: entry.bodyText,
        })
        if (entry.quotes.length > 0)
          await tx
            .insert(outboxQuotes)
            .values(
              entry.quotes.map((memberId) => ({
                outboxId: entry.id,
                memberId,
              })),
            )
            .onConflictDoNothing()
      }),
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
