import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { Pool } from '../db.js'
import type { OutboxKind } from './mailer.js'
import type { OutboxLog, OutboxRow, OutboxStatus } from './outbox-log.js'

function toRow(row: RowDataPacket): OutboxRow {
  return {
    id: String(row['id']),
    to: String(row['to_email']),
    kind: row['kind'] as OutboxKind,
    subject: String(row['subject']),
    bodyText: String(row['body_text']),
    status: row['status'] as OutboxStatus,
    error: (row['error'] as string | null) ?? null,
    createdAt: row['created_at'] as Date,
    sentAt: (row['sent_at'] as Date | null) ?? null,
  }
}

/** The outbound message log over MySQL, newest first. */
export function createMysqlOutboxLog(pool: Pool): OutboxLog {
  return {
    list: async (filter) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM outbox WHERE (? IS NULL OR to_email = ?) ' +
          'AND (? IS NULL OR status = ?) ' +
          'ORDER BY created_at DESC, id DESC LIMIT ?',
        [
          filter.to ?? null,
          filter.to ?? null,
          filter.status ?? null,
          filter.status ?? null,
          filter.limit,
        ],
      )
      return rows.map(toRow)
    },
    purgeBefore: async (cutoff) => {
      const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM outbox WHERE created_at < ?',
        [cutoff],
      )
      return result.affectedRows
    },
  }
}
