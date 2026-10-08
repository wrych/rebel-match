// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { holdZoom } from './zoom'

function fire(event: Event): boolean {
  document.dispatchEvent(event)
  return event.defaultPrevented
}

const pinch = (fingers: number): Event => {
  const event = new Event('touchmove', { cancelable: true })
  Object.defineProperty(event, 'touches', { value: { length: fingers } })
  return event
}

describe('holdZoom (R-GAME-12)', () => {
  it('cancels pinches and double taps while held, and lets go after', () => {
    const release = holdZoom()

    expect(fire(new Event('gesturestart', { cancelable: true }))).toBe(true)
    expect(fire(pinch(2))).toBe(true)
    expect(fire(pinch(1))).toBe(false)
    expect(fire(new MouseEvent('dblclick', { cancelable: true }))).toBe(true)

    release()
    expect(fire(new Event('gesturestart', { cancelable: true }))).toBe(false)
    expect(fire(pinch(2))).toBe(false)
  })
})
