import { describe, expect, it } from 'vitest'
import { gameDefaults } from '../../../src/game/tuning'
import { startDay } from '../core/state'
import { drawDay } from './draw'
import { palette } from './palette'

const { enabled: _enabled, ...tuning } = gameDefaults

/** A 2D context that does nothing but remember the text it was asked to
 * draw, and the transform in force. */
function recorder(): { ctx: CanvasRenderingContext2D; texts: unknown[][] } {
  const texts: unknown[][] = []
  let matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get: (target, key) => {
      if (key === 'setTransform')
        return (
          a: number,
          b: number,
          c: number,
          d: number,
          e: number,
          f: number,
        ) => {
          matrix = { a, b, c, d, e, f }
        }
      if (key === 'getTransform') return () => matrix
      if (key === 'fillText')
        return (text: string, x: number, y: number) =>
          texts.push([text, x, y, target['font']])
      if (typeof key === 'string' && key in target) return target[key]
      return () => undefined
    },
    set: (target, key, value) => {
      target[key as string] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts }
}

describe('drawDay', () => {
  it('sets the CR logo in screen pixels, over the tempted employee’s screen (R-GAME-18)', () => {
    const day = startDay(1, tuning, 1)
    const tempted = day.employees[0]
    if (tempted === undefined) throw new Error('no employee')
    tempted.spirit = 'tempted'
    const { ctx, texts } = recorder()

    drawDay(
      ctx,
      day,
      { x: 2, y: 0, width: 10, height: 9 },
      palette(() => ''),
      40,
    )

    expect(texts).toEqual([
      ['CR', (9 + 0.5 - 2) * 40, (2 + 0.39) * 40, 'bold 8px sans-serif'],
    ])
  })
})
