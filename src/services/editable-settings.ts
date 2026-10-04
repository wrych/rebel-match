import type { AbuseLimits, Config, Limits } from '../config.js'

/** A setting hosts may change in the app, with the bounds it must stay in
 * (R-CFG-6, ADR 0031). `max` may depend on another value, such as a column
 * width that is fixed in code. */
type Editable =
  | { section: 'abuse'; field: keyof AbuseLimits; min: number; max: Bound }
  | { section: 'limits'; field: keyof Limits; min: number; max: Bound }

type Bound = number | ((config: Config) => number)

type Sections = Pick<Config, 'abuse' | 'limits'>

const MINUTES_PER_DAY = 1440
const MS_PER_SECOND = 1000
const HOURS_PER_YEAR = 8760

// The bounds keep a slip of the finger from locking everyone out or switching
// a protection off; they are not tuning advice.
const editable = {
  'abuse.linkEmailsBeforeCheck': {
    section: 'abuse',
    field: 'linkEmailsBeforeCheck',
    min: 0,
    max: 50,
  },
  'abuse.linkEmailsCeiling': {
    section: 'abuse',
    field: 'linkEmailsCeiling',
    min: 1,
    max: 100,
  },
  'abuse.linkEmailWindowMinutes': {
    section: 'abuse',
    field: 'linkEmailWindowMinutes',
    min: 1,
    max: MINUTES_PER_DAY,
  },
  'abuse.authRequestsPerIp': {
    section: 'abuse',
    field: 'authRequestsPerIp',
    min: 10,
    max: 100_000,
  },
  'abuse.ipWindowMinutes': {
    section: 'abuse',
    field: 'ipWindowMinutes',
    min: 1,
    max: MINUTES_PER_DAY,
  },
  'abuse.applicantsBeforeCheck': {
    section: 'abuse',
    field: 'applicantsBeforeCheck',
    min: 0,
    max: 10_000,
  },
  'abuse.applicantsCeiling': {
    section: 'abuse',
    field: 'applicantsCeiling',
    min: 1,
    max: 100_000,
  },
  'abuse.applicantWindowMinutes': {
    section: 'abuse',
    field: 'applicantWindowMinutes',
    min: 1,
    max: MINUTES_PER_DAY,
  },
  'abuse.humanCheckCost': {
    section: 'abuse',
    field: 'humanCheckCost',
    min: 100,
    max: 20_000,
  },
  'abuse.humanCheckMinutes': {
    section: 'abuse',
    field: 'humanCheckMinutes',
    min: 1,
    max: 60,
  },
  'limits.inviteDefaultMaxUses': {
    section: 'limits',
    field: 'inviteDefaultMaxUses',
    min: 1,
    max: (c) => c.limits.inviteMaxUsesCeiling,
  },
  'limits.inviteDefaultHours': {
    section: 'limits',
    field: 'inviteDefaultHours',
    min: 1,
    max: HOURS_PER_YEAR,
  },
  'limits.challengeMinChars': {
    section: 'limits',
    field: 'challengeMinChars',
    min: 1,
    max: 1000,
  },
  'limits.beenThereNoteMinChars': {
    section: 'limits',
    field: 'beenThereNoteMinChars',
    min: 1,
    max: (c) => c.limits.connectionMessageMaxChars,
  },
} as const satisfies Record<string, Editable>

export type EditableKey = keyof typeof editable

// A pair whose first value must not exceed its second: free uses before a
// ceiling (R-NFR-8).
const ordered: readonly (readonly [EditableKey, EditableKey])[] = [
  ['abuse.linkEmailsBeforeCheck', 'abuse.linkEmailsCeiling'],
  ['abuse.applicantsBeforeCheck', 'abuse.applicantsCeiling'],
]

export function isEditableKey(key: string): key is EditableKey {
  return Object.hasOwn(editable, key)
}

/** A key's value in `config`. */
export function valueOf(config: Sections, key: EditableKey): number {
  const def: Editable = editable[key]
  return def.section === 'abuse'
    ? config.abuse[def.field]
    : config.limits[def.field]
}

function write(config: Sections, key: EditableKey, value: number): void {
  const def: Editable = editable[key]
  if (def.section === 'abuse') config.abuse[def.field] = value
  else config.limits[def.field] = value
}

/** The bounds a key's value must stay in, for the screen to show. */
export function boundsOf(
  config: Config,
  key: EditableKey,
): { min: number; max: number } {
  const def: Editable = editable[key]
  const max = typeof def.max === 'number' ? def.max : def.max(config)
  return { min: def.min, max }
}

/** One value a host set, as the store keeps it. */
export interface Override {
  key: string
  value: number
  changedBy: string | null
  changedByName: string | null
  changedAt: Date
}

export interface OverrideStore {
  list(): Promise<Override[]>
  save(key: EditableKey, value: number, memberId: string): Promise<void>
  remove(key: EditableKey): Promise<void>
}

export type SetResult = 'saved' | 'out_of_bounds' | 'out_of_order'

export interface EditableSettings {
  /** Re-reads the overrides and applies them over the deployment's values. */
  refresh(): Promise<void>
  set(key: EditableKey, value: number, memberId: string): Promise<SetResult>
  /** Goes back to the deployment's value. */
  reset(key: EditableKey): Promise<void>
  /** The overrides in force, by key, as of the last refresh or change. */
  overrides(): ReadonlyMap<string, Override>
  /** The value the deployment gives a key, before any override. */
  deployed(key: EditableKey): number
}

// The candidate is checked as it would stand with every other value in
// force, so an ordered pair cannot be crossed one half at a time.
function checkChange(
  config: Config,
  key: EditableKey,
  value: number,
): SetResult {
  const { min, max } = boundsOf(config, key)
  if (!Number.isInteger(value) || value < min || value > max)
    return 'out_of_bounds'
  const candidate: Sections = {
    abuse: { ...config.abuse },
    limits: { ...config.limits },
  }
  write(candidate, key, value)
  const crossed = ordered.some(
    ([low, high]) =>
      (low === key || high === key) &&
      valueOf(candidate, low) > valueOf(candidate, high),
  )
  return crossed ? 'out_of_order' : 'saved'
}

/** Applies hosts' changes to the live configuration, in place, so everything
 * reading `config.abuse` or `config.limits` at use sees them (ADR 0031). */
export function createEditableSettings(deps: {
  config: Config
  store: OverrideStore
}): EditableSettings {
  const deployment: Sections = {
    abuse: { ...deps.config.abuse },
    limits: { ...deps.config.limits },
  }
  let current = new Map<string, Override>()

  const apply = (rows: Override[]): void => {
    Object.assign(deps.config.abuse, deployment.abuse)
    Object.assign(deps.config.limits, deployment.limits)
    for (const row of rows) {
      if (isEditableKey(row.key)) write(deps.config, row.key, row.value)
    }
    current = new Map(rows.map((row) => [row.key, row]))
  }

  const refresh = async (): Promise<void> => {
    apply(await deps.store.list())
  }

  return {
    refresh,
    set: async (key, value, memberId) => {
      const result = checkChange(deps.config, key, value)
      if (result !== 'saved') return result
      await deps.store.save(key, value, memberId)
      await refresh()
      return 'saved'
    },
    reset: async (key) => {
      await deps.store.remove(key)
      await refresh()
    },
    overrides: () => current,
    deployed: (key) => valueOf(deployment, key),
  }
}

/** Re-reads the overrides on every interval, so a change saved on one server
 * reaches the others (ADR 0031). A failed read is reported and the next one
 * still happens. Returns a stop function. */
export function startSettingsRefresh(deps: {
  settings: Pick<EditableSettings, 'refresh'>
  everySeconds: number
  onError: (error: unknown) => void
}): () => void {
  const timer = setInterval(() => {
    deps.settings.refresh().catch(deps.onError)
  }, deps.everySeconds * MS_PER_SECOND)
  timer.unref()
  return () => {
    clearInterval(timer)
  }
}
