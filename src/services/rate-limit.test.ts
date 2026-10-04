import { describe, expect, it } from 'vitest'
import { createWindowCounter } from './rate-limit.js'

function clock(): { now: () => number; advance: (ms: number) => void } {
  let at = 1_000_000
  return {
    now: () => at,
    advance: (ms) => {
      at += ms
    },
  }
}

describe('createWindowCounter', () => {
  it('takes up to the limit, then refuses (R-NFR-8)', () => {
    const counter = createWindowCounter({ windowMinutes: 1, now: clock().now })

    expect([1, 2, 3, 4].map(() => counter.take('a', 3))).toEqual([
      true,
      true,
      true,
      false,
    ])
    expect(counter.count('a')).toBe(3)
  })

  it('counts each key on its own', () => {
    const counter = createWindowCounter({ windowMinutes: 1, now: clock().now })

    counter.add('a')
    counter.add('a')

    expect(counter.count('a')).toBe(2)
    expect(counter.count('b')).toBe(0)
    expect(counter.take('b', 1)).toBe(true)
  })

  it('starts over once the window has passed', () => {
    const time = clock()
    const counter = createWindowCounter({ windowMinutes: 1, now: time.now })
    counter.take('a', 1)

    time.advance(59_999)
    expect(counter.take('a', 1)).toBe(false)
    time.advance(1)
    expect(counter.count('a')).toBe(0)
    expect(counter.take('a', 1)).toBe(true)
  })

  it('forgets ended windows rather than keeping every key it has seen', () => {
    const time = clock()
    const counter = createWindowCounter({ windowMinutes: 1, now: time.now })
    for (let i = 0; i < 100; i++) counter.add(`ip-${String(i)}`)

    time.advance(60_000)
    counter.add('fresh')

    expect(counter.count('ip-0')).toBe(0)
    expect(counter.count('fresh')).toBe(1)
  })
})
