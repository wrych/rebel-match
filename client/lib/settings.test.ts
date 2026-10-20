import { describe, expect, it } from 'vitest'
import {
  changedCount,
  searchSettings,
  type SettingView,
  type SettingsGroup,
} from './settings'

const setting = (
  name: string,
  explanation: string,
  changed = false,
): SettingView => ({
  name,
  explanation,
  value: '1',
  changed,
  fixed: false,
})

const groups: SettingsGroup[] = [
  {
    title: 'Spam protection',
    explanation: 'Limits that stop scripts.',
    settings: [
      setting(
        'Sign-in emails per address',
        'Sent freely before a check.',
        true,
      ),
      setting('Time window for sign-in emails', 'The period both count over.'),
    ],
  },
  {
    title: 'Live lists',
    explanation: 'How often open lists re-read.',
    settings: [setting('Matches refresh every', 'While Matches is open.')],
  },
]

describe('changedCount (R-CFG-5)', () => {
  it('counts the values that differ from their default', () => {
    expect(groups.map(changedCount)).toEqual([1, 0])
  })
})

describe('searchSettings (R-CFG-5)', () => {
  it('keeps every group for a blank search', () => {
    expect(searchSettings(groups, '  ')).toEqual(groups)
  })

  it('keeps every group until the search holds three characters', () => {
    expect(searchSettings(groups, ' wi ')).toEqual(groups)
    expect(searchSettings(groups, 'win').map((group) => group.title)).toEqual([
      'Spam protection',
    ])
  })

  it('keeps only the values whose name holds the search, ignoring case', () => {
    expect(searchSettings(groups, 'WINDOW')).toEqual([
      { ...groups[0], settings: [groups[0]?.settings[1]] },
    ])
  })

  it('finds a value by its explanation too', () => {
    expect(
      searchSettings(groups, 'while matches').map((group) => group.title),
    ).toEqual(['Live lists'])
  })

  it('keeps every value of a group whose title holds the search', () => {
    expect(searchSettings(groups, 'spam')).toEqual([groups[0]])
  })

  it('drops the groups nothing in them matches', () => {
    expect(searchSettings(groups, 'no such setting')).toEqual([])
  })
})
