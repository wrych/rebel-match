// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isStaleChunk,
  reloadForStaleChunk,
  settledAfterReload,
} from './stale-chunk'

afterEach(() => {
  sessionStorage.clear()
})

describe('stale chunks after a deploy', () => {
  it('knows a lazily loaded file that would not load, in every browser', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: /assets/Leaderboard-1.js',
      'Importing a module script failed.',
      'error loading dynamically imported module',
      'Unable to preload CSS for /assets/Leaderboard-1.css',
    ])
      expect(isStaleChunk(new TypeError(message))).toBe(true)
    expect(isStaleChunk(new Error('session unavailable (502)'))).toBe(false)
    expect(isStaleChunk('Failed to fetch dynamically imported module')).toBe(
      false,
    )
  })

  it('reloads at the address once, and again only after a navigation went through', () => {
    const go = vi.fn()

    expect(reloadForStaleChunk('/9torevolution/leaderboard', go)).toBe(true)
    expect(reloadForStaleChunk('/9torevolution/leaderboard', go)).toBe(false)
    expect(go).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith('/9torevolution/leaderboard')

    settledAfterReload()
    expect(reloadForStaleChunk('/9torevolution/leaderboard', go)).toBe(true)
  })
})
