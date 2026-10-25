import { describe, expect, it } from 'vitest'
import { abuseEnv, changeableAbuse } from './abuse.js'
import { boundsOf, isSettingKey } from './changeable-settings.js'
import { loadConfig, type Config } from './config.js'
import { changeableLimits, limitsEnv } from './limits.js'

const valid = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
} satisfies NodeJS.ProcessEnv

type Group = 'limits' | 'abuse'

const groups = [
  { group: 'limits', env: limitsEnv, changeable: changeableLimits },
  { group: 'abuse', env: abuseEnv, changeable: changeableAbuse },
] as const

const valuesOf = (config: Config, group: Group): Record<string, number> =>
  config[group]

// 401 sits inside every limit's valid range and is no limit's default.
const SET = '401'

function changedBy(group: Group, variable: string): string[] {
  const before = valuesOf(loadConfig(valid), group)
  const after = valuesOf(loadConfig({ ...valid, [variable]: SET }), group)
  return Object.keys(before).filter((key) => after[key] !== before[key])
}

describe.each(groups)('the $group registry', ({ group, env, changeable }) => {
  const variables = Object.keys(env)

  it.each(variables)('%s sets exactly one value (R-CFG-1)', (variable) => {
    const changed = changedBy(group, variable)

    expect(changed).toHaveLength(1)
    const [key = ''] = changed
    expect(
      valuesOf(loadConfig({ ...valid, [variable]: SET }), group)[key],
    ).toBe(Number(SET))
  })

  it('reads each value from a variable of its own', () => {
    const set = variables.flatMap((variable) => changedBy(group, variable))

    expect(new Set(set).size).toBe(variables.length)
  })

  it.each(variables)(
    '%s refuses negatives and fractions (R-CFG-4)',
    (variable) => {
      expect(() => loadConfig({ ...valid, [variable]: '-1' })).toThrow(variable)
      expect(() => loadConfig({ ...valid, [variable]: '1.5' })).toThrow(
        variable,
      )
    },
  )

  it('lets hosts change exactly its changeable values, within their bounds (R-CFG-6)', () => {
    for (const [key, bounds] of Object.entries(changeable)) {
      const settingKey = `${group}.${key}`
      expect(isSettingKey(settingKey)).toBe(true)
      if (isSettingKey(settingKey)) expect(boundsOf(settingKey)).toEqual(bounds)
    }
  })
})

describe('the zero rule', () => {
  it('refuses zero for a limit, so nothing waits forever or holds nothing', () => {
    const switches = ['NETWORK_REPLAY', 'NETWORK_MIN_OWN_CONNECTIONS']
    for (const variable of Object.keys(limitsEnv).filter(
      (each) => !switches.includes(each),
    ))
      expect(() => loadConfig({ ...valid, [variable]: '0' })).toThrow(variable)
  })

  it('allows zero for the network replay’s switch and own-lines threshold (R-NET-6, R-NET-13)', () => {
    const zeroAllowed = Object.keys(limitsEnv).filter((variable) => {
      try {
        loadConfig({ ...valid, [variable]: '0' })
        return true
      } catch {
        return false
      }
    })

    expect(zeroAllowed).toEqual([
      'NETWORK_REPLAY',
      'NETWORK_MIN_OWN_CONNECTIONS',
    ])
  })

  it('allows zero free tries before the human check, and nowhere else in abuse (R-NFR-8)', () => {
    const zeroAllowed = Object.keys(abuseEnv).filter((variable) => {
      try {
        loadConfig({ ...valid, [variable]: '0' })
        return true
      } catch {
        return false
      }
    })

    expect(zeroAllowed).toEqual([
      'LINK_EMAILS_BEFORE_CHECK',
      'APPLICANTS_BEFORE_CHECK',
    ])
  })
})

describe('fixed and unchangeable limits', () => {
  it('keeps a fixed limit whatever the environment says', () => {
    expect(
      loadConfig({ ...valid, NAME_MAX_CHARS: '5' }).limits.nameMaxChars,
    ).toBe(120)
  })

  it('does not let hosts change a limit the registry does not mark changeable', () => {
    expect(isSettingKey('limits.challengeMaxChars')).toBe(false)
    expect(isSettingKey('limits.deckPageSize')).toBe(false)
  })
})
