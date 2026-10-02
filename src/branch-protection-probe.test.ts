import { describe, expect, it } from 'vitest'

describe('branch protection probe', () => {
  it('fails on purpose, so CI goes red and the merge is blocked', () => {
    expect(1 + 1).toBe(3)
  })
})
