import { describe, expect, it } from 'vitest'
import { canReach, type ReachFacts } from './reach.js'

const open: ReachFacts = {
  isCaller: false,
  reachable: true,
  findable: true,
  searchOn: true,
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
  ])('never reaches %s', (_who, change) => {
    expect(canReach({ ...open, ...change })).toBe(false)
  })
})
