import { describe, expect, it } from 'vitest'
import { actionLabel, heading, keyAction, steers } from './keys'

describe('keys (R-GAME-12)', () => {
  it('steers with the arrows or WASD, and stands still when they cancel out', () => {
    expect(steers('KeyW')).toBe(true)
    expect(steers('Space')).toBe(false)
    expect(heading(new Set(['ArrowUp', 'KeyD']))).toEqual({ x: 1, y: -1 })
    expect(heading(new Set(['ArrowLeft', 'ArrowRight']))).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('helps with Space and sends on a break with E, directly', () => {
    expect(keyAction('Space', ['help', 'break'])).toBe('help')
    expect(keyAction('KeyE', ['help', 'break'])).toBe('break')
    expect(keyAction('Space', ['break'])).toBe('break')
    expect(keyAction('KeyE', ['help'])).toBeUndefined()
    expect(keyAction('KeyQ', ['help'])).toBeUndefined()
  })

  it('names each action as the button shows it', () => {
    expect(actionLabel('breakUp')).toBe('Break it up')
  })
})
