import { describe, expect, it } from 'vitest'
import { cacheKey } from './cache-key.js'

const input = {
  diff: 'diff --git a/x b/x',
  commits: 'abc refactor(x): move y',
  agent: 'reviewer prompt',
  config: { threshold: 4 },
}

describe('cacheKey', () => {
  it('is stable for the same review input', () => {
    expect(cacheKey(input)).toBe(cacheKey({ ...input }))
  })

  it('changes when the same diff is split into different commits', () => {
    expect(cacheKey({ ...input, commits: 'def feat(x): move y' })).not.toBe(
      cacheKey(input),
    )
  })

  it('changes with the diff, the reviewer prompt or the config', () => {
    const key = cacheKey(input)

    expect(cacheKey({ ...input, diff: 'other' })).not.toBe(key)
    expect(cacheKey({ ...input, agent: 'other' })).not.toBe(key)
    expect(cacheKey({ ...input, config: { threshold: 5 } })).not.toBe(key)
  })

  it('does not confuse where one part ends and the next begins', () => {
    expect(cacheKey({ ...input, diff: 'ab', commits: 'c' })).not.toBe(
      cacheKey({ ...input, diff: 'a', commits: 'bc' }),
    )
  })
})
