import type { Pool } from '../db.js'
import type { OutboxStore } from './mailer.js'

/** The outbound message log over MySQL (design §2 `outbox`). */
export function createMysqlOutboxStore(pool: Pool): OutboxStore {
  return {
    record: async (entry) => {
      await pool.query(
        'INSERT INTO outbox (id, member_id, to_email, kind, subject, body_text) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
        [
          entry.id,
          entry.memberId,
          entry.to,
          entry.kind,
          entry.subject,
          entry.bodyText,
        ],
      )
    },
    markSent: async (id, at) => {
      await pool.query(
        "UPDATE outbox SET status = 'sent', sent_at = ? WHERE id = ?",
        [at, id],
      )
    },
    markSuppressed: async (id) => {
      await pool.query("UPDATE outbox SET status = 'suppressed' WHERE id = ?", [
        id,
      ])
    },
    markFailed: async (id, error) => {
      await pool.query(
        "UPDATE outbox SET status = 'failed', error = ? WHERE id = ?",
        [error, id],
      )
    },
  }
}
