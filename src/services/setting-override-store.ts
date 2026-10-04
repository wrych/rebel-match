import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members, settingOverrides } from '../db/schema.js'
import type { OverrideStore } from './editable-settings.js'

/** Hosts' setting overrides over `setting_overrides` (design §2), with the
 * name of whoever made each change. */
export function createOverrideStore(db: Database): OverrideStore {
  return {
    list: async () => {
      const rows = await db
        .select({
          key: settingOverrides.key,
          value: settingOverrides.value,
          changedBy: settingOverrides.changedBy,
          changedByName: members.name,
          changedAt: settingOverrides.changedAt,
        })
        .from(settingOverrides)
        .leftJoin(members, eq(members.id, settingOverrides.changedBy))
      return rows
    },
    save: async (key, value, memberId) => {
      await db
        .insert(settingOverrides)
        .values({ key, value, changedBy: memberId })
        .onConflictDoUpdate({
          target: settingOverrides.key,
          set: { value, changedBy: memberId, changedAt: sql`now()` },
        })
    },
    remove: async (key) => {
      await db.delete(settingOverrides).where(eq(settingOverrides.key, key))
    },
  }
}
