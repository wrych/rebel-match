import { describe, expect, it } from 'vitest'
import { swipeStep } from './swipe'

const start = { x: 200, y: 300 }

describe('swipeStep (R-OFF-1)', () => {
  it('moves to the next card on a swipe to the left', () => {
    expect(swipeStep(start, { x: 120, y: 310 }, 50)).toBe(1)
  })

  it('moves to the previous card on a swipe to the right', () => {
    expect(swipeStep(start, { x: 280, y: 290 }, 50)).toBe(-1)
  })

  it('ignores a movement shorter than the threshold, as a tap', () => {
    expect(swipeStep(start, { x: 151, y: 300 }, 50)).toBe(0)
  })

  it('counts a movement of exactly the threshold', () => {
    expect(swipeStep(start, { x: 150, y: 300 }, 50)).toBe(1)
  })

  it('leaves a mostly vertical movement to scrolling', () => {
    expect(swipeStep(start, { x: 120, y: 400 }, 50)).toBe(0)
  })
})
