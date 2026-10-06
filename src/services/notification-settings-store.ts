import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { notificationSettings, notifications } from '../db/schema.js'
import type { ChoosableType } from './notification-cadence.js'
import type { NotificationSettingsStore } from './notification-settings.js'

const s = notificationSettings

// A waiting notification is held for its cadence; a new choice lets the
// worker decide afresh. One waiting for a retry keeps its wait (R-NOTE-3,
// R-NOTE-10).
async function releaseWaiting(
  db: Database,
  memberId: string,
  type: ChoosableType,
): Promise<void> {
  await db
    .update(notifications)
    .set({ nextAttemptAt: null })
    .where(
      and(
        eq(notifications.recipientId, memberId),
        eq(notifications.type, type),
        eq(notifications.mailStatus, 'waiting'),
        eq(notifications.attempts, 0),
      ),
    )
}

// Off hides what was not seen yet and stops its mail (R-NOTE-3).
async function hideUnseen(
  db: Database,
  memberId: string,
  type: ChoosableType,
): Promise<void> {
  await db
    .update(notifications)
    .set({
      hidden: true,
      mailStatus: sql`CASE WHEN ${notifications.mailStatus} = 'waiting' THEN 'skipped'::notification_mail_status ELSE ${notifications.mailStatus} END`,
      skippedReason: sql`CASE WHEN ${notifications.mailStatus} = 'waiting' THEN 'off' ELSE ${notifications.skippedReason} END`,
    })
    .where(
      and(
        eq(notifications.recipientId, memberId),
        eq(notifications.type, type),
        isNull(notifications.seenAt),
      ),
    )
}

/** Members' notification choices over Postgres (design §2). */
export function createNotificationSettingsStore(
  db: Database,
): NotificationSettingsStore {
  return {
    chosen: async (memberId) => {
      const rows = await db
        .select({ type: s.type, cadence: s.cadence })
        .from(s)
        .where(eq(s.memberId, memberId))
      return Object.fromEntries(rows.map((row) => [row.type, row.cadence]))
    },
    choose: async (memberId, type, cadence) => {
      if (cadence === null) {
        await db
          .delete(s)
          .where(and(eq(s.memberId, memberId), eq(s.type, type)))
        return
      }
      await db
        .insert(s)
        .values({ memberId, type, cadence })
        .onConflictDoUpdate({ target: [s.memberId, s.type], set: { cadence } })
    },
    releaseWaiting: (memberId, type) => releaseWaiting(db, memberId, type),
    hideUnseen: (memberId, type) => hideUnseen(db, memberId, type),
  }
}
