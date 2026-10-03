import { describe, expect, it } from 'vitest'
import { activeTab, matchesLabel, showsTabs } from './tabs'

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
    ['/admin/invites', undefined],
  ])('lights the tab for %s: %s', (path, label) => {
    expect(activeTab(path)?.label).toBe(label)
  })
})

describe('matchesLabel', () => {
  it.each([
    [0, 'Matches'],
    [1, 'Matches, 1 request waiting'],
    [3, 'Matches, 3 requests waiting'],
  ])('reads %i waiting as %s (R-MINE-4)', (waiting, label) => {
    expect(matchesLabel(waiting)).toBe(label)
  })
})
