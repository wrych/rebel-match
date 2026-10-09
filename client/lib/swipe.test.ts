import { describe, expect, it } from 'vitest'
import {
  cardMotion,
  cardPose,
  dragAxis,
  flyOutX,
  slideInX,
  swipeStep,
} from './swipe'

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

describe('dragAxis (R-OFF-1)', () => {
  it('waits until the finger has moved the lock distance', () => {
    expect(dragAxis(start, { x: 205, y: 303 }, 8)).toBeNull()
  })

  it('follows a mostly sideways drag', () => {
    expect(dragAxis(start, { x: 190, y: 305 }, 8)).toBe('x')
  })

  it('leaves a mostly vertical drag to scrolling', () => {
    expect(dragAxis(start, { x: 206, y: 290 }, 8)).toBe('y')
  })
})

describe('cardPose (R-OFF-1)', () => {
  it('rests upright with no drag', () => {
    expect(cardPose(0)).toEqual({ x: 0, rotateDeg: 0 })
  })

  it('follows the finger and leans the way it drags', () => {
    const left = cardPose(-40)
    const right = cardPose(40)

    expect(left.x).toBe(-40)
    expect(left.rotateDeg).toBeLessThan(0)
    expect(right).toEqual({ x: 40, rotateDeg: -left.rotateDeg })
  })

  it('leans no further than the tilt cap', () => {
    expect(cardPose(5000).rotateDeg).toBe(cardMotion.maxTiltDeg)
    expect(cardPose(-5000).rotateDeg).toBe(-cardMotion.maxTiltDeg)
  })
})

describe('flyOutX and slideInX (R-OFF-1)', () => {
  it('sends the card off the way it was swiped, a viewport away', () => {
    expect(flyOutX(1, 400)).toBe(-400)
    expect(flyOutX(-1, 400)).toBe(400)
  })

  it('brings the next card in from the other side', () => {
    expect(slideInX(1, 400)).toBeGreaterThan(0)
    expect(slideInX(-1, 400)).toBeLessThan(0)
  })
})
