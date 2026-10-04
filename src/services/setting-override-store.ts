import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { members, settingOverrides } from '../db/schema.js'
import type { SettingOverrideStore } from './settings.js'

/** Overrides over `setting_overrides` (design §2, ADR 0031). */
export function createSettingOverrideStore(db: Database): SettingOverrideStore {
  return {
    list: () =>
      db
        .select({
          key: settingOverrides.key,
          value: settingOverrides.value,
          changedBy: settingOverrides.changedBy,
          changerName: members.name,
          changedAt: settingOverrides.changedAt,
        })
        .from(settingOverrides)
        .leftJoin(members, eq(members.id, settingOverrides.changedBy))
        .orderBy(settingOverrides.key),
    set: async (key, value, changedBy, at) => {
      await db
        .insert(settingOverrides)
        .values({ key, value, changedBy, changedAt: at })
        .onConflictDoUpdate({
          target: settingOverrides.key,
          set: { value, changedBy, changedAt: at },
        })
    },
    remove: async (key) => {
      await db.delete(settingOverrides).where(eq(settingOverrides.key, key))
    },
  }
}
