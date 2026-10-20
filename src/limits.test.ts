import { describe, expect, it } from 'vitest'
import { boundsOf, isSettingKey } from './changeable-settings.js'
import { loadConfig } from './config.js'
import { changeableLimits, limitsEnv, type LimitKey } from './limits.js'

const valid = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
} satisfies NodeJS.ProcessEnv

const defaults = loadConfig(valid).limits
const variables = Object.keys(limitsEnv)

function changedBy(variable: string, value: string): LimitKey[] {
  const limits = loadConfig({ ...valid, [variable]: value }).limits
  return (Object.keys(defaults) as LimitKey[]).filter(
    (key) => limits[key] !== defaults[key],
  )
}

describe('limits', () => {
  it.each(variables)('%s sets exactly one limit (R-CFG-1)', (variable) => {
    const changed = changedBy(variable, '401')

    expect(changed).toHaveLength(1)
    expect(
      loadConfig({ ...valid, [variable]: '401' }).limits[
        changed[0] as LimitKey
      ],
    ).toBe(401)
  })

  it('reads every tunable limit from a variable of its own', () => {
    const set = variables.flatMap((variable) => changedBy(variable, '401'))

    expect(new Set(set).size).toBe(variables.length)
  })

  it.each(variables)('%s refuses zero and fractions (R-CFG-4)', (variable) => {
    expect(() => loadConfig({ ...valid, [variable]: '0' })).toThrow(variable)
    expect(() => loadConfig({ ...valid, [variable]: '1.5' })).toThrow(variable)
  })

  it('keeps a fixed limit whatever the environment says', () => {
    expect(
      loadConfig({ ...valid, NAME_MAX_CHARS: '5' }).limits.nameMaxChars,
    ).toBe(120)
  })

  it('lets hosts change exactly the changeable limits, within their bounds (R-CFG-6)', () => {
    for (const [key, bounds] of Object.entries(changeableLimits)) {
      const settingKey = `limits.${key}`
      expect(isSettingKey(settingKey)).toBe(true)
      if (isSettingKey(settingKey)) expect(boundsOf(settingKey)).toEqual(bounds)
    }
    expect(isSettingKey('limits.challengeMaxChars')).toBe(false)
    expect(isSettingKey('limits.deckPageSize')).toBe(false)
  })
})
