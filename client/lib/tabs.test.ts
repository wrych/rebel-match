import { describe, expect, it } from 'vitest'
import { activeTab, matchesBadge, matchesLabel, showsTabs, tabs } from './tabs'

describe('showsTabs', () => {
  it.each([
    ['onboarded', 'cockpit', true],
    ['onboarded', 'challenge', true],
    ['onboarded', 'welcome', false],
    ['session', 'onboarding', false],
    ['public', 'login', false],
    [undefined, 'not-found', false],
  ])('shows the bar for %s screen %s: %s', (access, name, expected) => {
    expect(showsTabs(access, name)).toBe(expected)
  })
})

describe('activeTab', () => {
  it.each([
    ['/ask', 'Submit'],
    ['/challenges/c1/matches', 'Submit'],
    ['/offer', 'Swipe'],
    ['/offer/c1/note', 'Swipe'],
    ['/matches', 'Matches'],
    ['/matches/requests/r1/contact', 'Matches'],
    ['/welcome', 'Home'],
    ['/admin/invites', undefined],
  ])('lights the tab for %s: %s', (path, label) => {
    expect(activeTab(path)?.label).toBe(label)
  })
})

describe('tabs', () => {
  it('starts with Home, the welcome screen', () => {
    expect(tabs.map((tab) => tab.label)).toEqual([
      'Home',
      'Submit',
      'Swipe',
      'Matches',
    ])
    expect(tabs[0]?.to).toBe('/welcome')
  })
})

describe('matchesLabel', () => {
  it.each([
    [0, 0, 'Matches'],
    [1, 0, 'Matches, 1 new request'],
    [3, 0, 'Matches, 3 new requests'],
    [0, 1, 'Matches, 1 new connection'],
    [2, 2, 'Matches, 2 new requests, 2 new connections'],
  ])(
    'reads %i waiting and %i connected as %s (R-MINE-4, R-CONN-7)',
    (waiting, connected, label) => {
      expect(matchesLabel({ waiting, connected })).toBe(label)
    },
  )
})

describe('matchesBadge', () => {
  it('counts waiting requests and new connections together (R-CONN-7)', () => {
    expect(matchesBadge({ waiting: 2, connected: 1 })).toBe(3)
  })
})
