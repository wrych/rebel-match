import { sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members, notifications, recapAnnouncement } from '../db/schema.js'
import type { RecapAnnounceStore } from './recap-announce.js'

/** The recap's one announcement in Postgres: the table is locked while the
 * notifications and the record of having sent them are written, so two
 * servers never both announce it (R-RECAP-9, ADR 0060). */
export function createRecapAnnounceStore(db: Database): RecapAnnounceStore {
  return {
    announced: async () =>
      (
        await db
          .select({ at: recapAnnouncement.doneAt })
          .from(recapAnnouncement)
          .limit(1)
      ).length > 0,
    announceOnce: (at) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`lock table ${recapAnnouncement} in exclusive mode`)
        const done = await tx
          .select({ at: recapAnnouncement.doneAt })
          .from(recapAnnouncement)
          .limit(1)
        if (done.length > 0) return false
        await tx.execute(sql`
          insert into ${notifications} (id, recipient_id, type, about_member_id)
          select gen_random_uuid()::text, ${members.id}, 'recap', ${members.id}
          from ${members}
          where ${members.status} = 'active'
            and ${members.name} is not null
            and ${members.consentAt} is not null`)
        await tx.insert(recapAnnouncement).values({ doneAt: at })
        return true
      }),
  }
}
