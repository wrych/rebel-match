import { describe, expect, it } from 'vitest'
import { canReach, type ReachFacts } from './reach.js'

const open: ReachFacts = {
  isCaller: false,
  reachable: true,
  findable: true,
  searchOn: true,
  presentsCode: false,
  codesOn: false,
}

const byCode: ReachFacts = {
  ...open,
  findable: false,
  searchOn: false,
  presentsCode: true,
  codesOn: true,
}

describe('reaching a member directly (R-FIND-6, R-FIND-7)', () => {
  it('lets a caller reach a findable, active member while search is on', () => {
    expect(canReach(open)).toBe(true)
  })

  it.each([
    ['themselves', { isCaller: true }],
    ['a member not active or not onboarded', { reachable: false }],
    ['a member who turned findable off', { findable: false }],
    ['anyone while search is off', { searchOn: false }],
  ])('never reaches %s by search', (_who, change) => {
    expect(canReach({ ...open, ...change })).toBe(false)
  })
})

describe('reaching a member by their profile code (R-CODE-3)', () => {
  it('reaches the owner of a usable code, findable or not, search on or off', () => {
    expect(canReach(byCode)).toBe(true)
  })

  it.each([
    ['the caller’s own code', { isCaller: true }],
    ['an owner no longer active', { reachable: false }],
    ['a code not presented, or off', { presentsCode: false }],
    ['any code while codes are off', { codesOn: false }],
  ])('never reaches through %s', (_what, change) => {
    expect(canReach({ ...byCode, ...change })).toBe(false)
  })
})
