import { describe, expect, it } from 'vitest'
import { recapOpen } from './open.js'

const at = Date.UTC(2026, 10, 8, 17, 0) / 60_000

describe('recapOpen (R-RECAP-1, R-RECAP-8)', () => {
  it('is open while switched on, whatever the time', () => {
    expect(recapOpen({ recap: 1, recapOpensAt: 0 }, 0)).toBe(true)
    expect(recapOpen({ recap: 1, recapOpensAt: at }, 0)).toBe(true)
  })

  it('opens by itself once the time has come', () => {
    const limits = { recap: 0, recapOpensAt: at }

    expect(recapOpen(limits, Date.UTC(2026, 10, 8, 16, 59))).toBe(false)
    expect(recapOpen(limits, Date.UTC(2026, 10, 8, 17, 0))).toBe(true)
  })

  it('stays closed with neither', () => {
    expect(recapOpen({ recap: 0, recapOpensAt: 0 }, Date.now())).toBe(false)
  })
})
