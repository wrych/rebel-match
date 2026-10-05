import type { SettingOverride, SettingOverrideStore } from './settings.js'

/** Overrides kept in memory, for tests that need no database. `names` maps a
 * member id to the name shown as who made a change. */
export function createMemorySettingOverrideStore(
  names: Readonly<Record<string, string>> = {},
): SettingOverrideStore {
  const rows = new Map<string, SettingOverride>()
  return {
    list: () =>
      Promise.resolve(
        [...rows.values()].sort((a, b) => a.key.localeCompare(b.key)),
      ),
    set: (key, value, changedBy, at) => {
      rows.set(key, {
        key,
        value,
        changedBy,
        changerName: names[changedBy] ?? null,
        changedAt: at,
      })
      return Promise.resolve()
    },
    remove: (key) => {
      rows.delete(key)
      return Promise.resolve()
    },
  }
}
