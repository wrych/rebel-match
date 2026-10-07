import { describe, expect, it } from 'vitest'
import {
  boundsOf,
  checkChange,
  isSettingKey,
  valueOf,
  withOverrides,
  type SettingValues,
} from './changeable-settings.js'
import { defaultConfig } from './config.js'

const config = defaultConfig()
const base: SettingValues = {
  limits: config.limits,
  abuse: config.abuse,
  game: config.game,
}

describe('changeable settings (R-CFG-6, ADR 0031)', () => {
  it('names only the settings hosts may change', () => {
    expect(isSettingKey('abuse.applicantsCeiling')).toBe(true)
    expect(isSettingKey('limits.challengeMinChars')).toBe(true)
    expect(isSettingKey('limits.nameMaxChars')).toBe(false)
    expect(isSettingKey('trustProxy')).toBe(false)
    expect(isSettingKey('sessionSecret')).toBe(false)
  })

  it('lets hosts tune the game within what a floor holds (R-GAME-17)', () => {
    expect(isSettingKey('game.enabled')).toBe(true)
    expect(isSettingKey('game.ceo.meetingSeats')).toBe(true)
    expect(isSettingKey('game.teamLead.meetingSeats')).toBe(false)
    expect(valueOf(base, 'game.enabled')).toBe(0)
    expect(checkChange(base, 'game.enabled', 1)).toBe('ok')
    expect(checkChange(base, 'game.enabled', 2)).toBe('out_of_bounds')
    expect(checkChange(base, 'game.teamLead.employees', 5)).toBe(
      'out_of_bounds',
    )
    expect(checkChange(base, 'game.rebel.fileFloorSeconds', 11)).toBe(
      'out_of_order',
    )
    expect(
      withOverrides(base, [{ key: 'game.dayLengthSeconds', value: 120 }]).game
        .dayLengthSeconds,
    ).toBe(120)
  })

  it('accepts a value within bounds', () => {
    expect(checkChange(base, 'abuse.applicantsCeiling', 500)).toBe('ok')
  })

  it.each([0, 100_001, 2.5, Number.NaN])(
    'refuses %s for the applicant ceiling, outside its bounds',
    (value) => {
      expect(checkChange(base, 'abuse.applicantsCeiling', value)).toBe(
        'out_of_bounds',
      )
    },
  )

  it('keeps every bound on a whole number the column can hold', () => {
    for (const key of ['abuse.humanCheckCost', 'limits.inviteDefaultMaxUses'])
      if (isSettingKey(key)) expect(boundsOf(key).max).toBeLessThan(2 ** 31)
  })

  it('refuses a ceiling below the free uses it caps', () => {
    expect(checkChange(base, 'abuse.linkEmailsCeiling', 2)).toBe('out_of_order')
    expect(checkChange(base, 'abuse.applicantsBeforeCheck', 301)).toBe(
      'out_of_order',
    )
    expect(checkChange(base, 'abuse.linkEmailsCeiling', 3)).toBe('ok')
  })

  it('refuses a shortest challenge above the longest (R-ASK-3)', () => {
    const values = {
      ...base,
      limits: { ...base.limits, challengeMaxChars: 100 },
    }

    expect(checkChange(values, 'limits.challengeMinChars', 101)).toBe(
      'out_of_order',
    )
    expect(checkChange(values, 'limits.challengeMinChars', 100)).toBe('ok')
  })

  it('falls back to the deployment’s shortest challenge above a lowered longest', () => {
    const deployment = {
      ...base,
      limits: { ...base.limits, challengeMaxChars: 100 },
    }

    const values = withOverrides(deployment, [
      { key: 'limits.challengeMinChars', value: 150 },
    ])

    expect(valueOf(values, 'limits.challengeMinChars')).toBe(31)
  })

  it('applies the hosts’ changes over the deployment’s values', () => {
    const values = withOverrides(base, [
      { key: 'limits.challengeMinChars', value: 50 },
      { key: 'abuse.applicantsCeiling', value: 500 },
    ])

    expect(valueOf(values, 'limits.challengeMinChars')).toBe(50)
    expect(valueOf(values, 'abuse.applicantsCeiling')).toBe(500)
    expect(valueOf(values, 'abuse.linkEmailsCeiling')).toBe(10)
  })

  it('applies a pair in any order once both are stored', () => {
    const values = withOverrides(base, [
      { key: 'abuse.linkEmailsBeforeCheck', value: 40 },
      { key: 'abuse.linkEmailsCeiling', value: 50 },
    ])

    expect(valueOf(values, 'abuse.linkEmailsBeforeCheck')).toBe(40)
    expect(valueOf(values, 'abuse.linkEmailsCeiling')).toBe(50)
  })

  it('skips a stored change that is unknown or past its bounds', () => {
    const values = withOverrides(base, [
      { key: 'sessionSecret', value: 1 },
      { key: 'abuse.humanCheckCost', value: 1 },
    ])

    expect(values).toEqual(base)
  })

  it('falls back to the deployment’s pair when stored values leave it out of order', () => {
    const values = withOverrides(base, [
      { key: 'abuse.applicantsBeforeCheck', value: 400 },
    ])

    expect(valueOf(values, 'abuse.applicantsBeforeCheck')).toBe(30)
    expect(valueOf(values, 'abuse.applicantsCeiling')).toBe(300)
  })
})
