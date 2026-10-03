import { describe, expect, it } from 'vitest'
import { cacheKey } from './cache-key.js'

const input = {
  diff: 'diff --git a/x b/x',
  agent: 'reviewer prompt',
  config: { threshold: 4 },
}

describe('cacheKey', () => {
  it('is stable for the same review input', () => {
    expect(cacheKey(input)).toBe(cacheKey({ ...input }))
  })

  it('changes with the diff, the reviewer prompt or the config', () => {
    const key = cacheKey(input)

    expect(cacheKey({ ...input, diff: 'other' })).not.toBe(key)
    expect(cacheKey({ ...input, agent: 'other' })).not.toBe(key)
    expect(cacheKey({ ...input, config: { threshold: 5 } })).not.toBe(key)
  })
})
