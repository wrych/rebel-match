import {
  checkChange,
  isSettingKey,
  keepsOrder,
  valueOf,
  withOverrides,
  type SettingValues,
} from '../changeable-settings.js'
import type { Config, LiveSettings } from '../config.js'

/** A value a host set in the app, with who set it and when (R-CFG-6). */
export interface SettingOverride {
  key: string
  value: number
  changedBy: string | null
  changerName: string | null
  changedAt: Date
}

export interface SettingOverrideStore {
  list(): Promise<SettingOverride[]>
  /** Sets `key` to `value`, replacing any earlier change. */
  set(key: string, value: number, changedBy: string, at: Date): Promise<void>
  /** Forgets the change to `key`, so the deployment's value holds again. */
  remove(key: string): Promise<void>
}

export type ChangeOutcome =
  'saved' | 'not_found' | 'out_of_bounds' | 'out_of_order'
export type ResetOutcome = 'reset' | 'not_found' | 'out_of_order'

/** The settings in force: the deployment's values with the hosts' changes
 * applied, re-read by `refresh` (R-CFG-6, ADR 0031). */
export interface SettingsService extends LiveSettings {
  /** The deployment's values, before any change made in the app. */
  deployment(): SettingValues
  /** The changes in force as last read, with who made them. */
  overrides(): readonly SettingOverride[]
  refresh(): Promise<void>
  change(key: string, value: number, changedBy: string): Promise<ChangeOutcome>
  reset(key: string): Promise<ResetOutcome>
}

export function createSettings(deps: {
  config: Config
  store: SettingOverrideStore
  now?: () => Date
}): SettingsService {
  const now = deps.now ?? ((): Date => new Date())
  const deployment: SettingValues = {
    limits: deps.config.limits,
    abuse: deps.config.abuse,
  }
  let stored: SettingOverride[] = []
  let current = deployment

  const refresh = async (): Promise<void> => {
    stored = await deps.store.list()
    current = withOverrides(deployment, stored)
  }

  return {
    limits: () => current.limits,
    abuse: () => current.abuse,
    deployment: () => deployment,
    overrides: () =>
      stored.filter(
        ({ key, value }) =>
          isSettingKey(key) && valueOf(current, key) === value,
      ),
    refresh,
    change: async (key, value, changedBy) => {
      if (!isSettingKey(key)) return 'not_found'
      await refresh()
      const check = checkChange(current, key, value)
      if (check !== 'ok') return check
      await deps.store.set(key, value, changedBy, now())
      await refresh()
      return 'saved'
    },
    reset: async (key) => {
      if (!isSettingKey(key)) return 'not_found'
      await refresh()
      if (!keepsOrder(current, key, valueOf(deployment, key)))
        return 'out_of_order'
      await deps.store.remove(key)
      await refresh()
      return 'reset'
    },
  }
}
