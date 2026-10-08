import { describe, expect, it } from 'vitest'
import { gameDefaults } from '../../../src/game/tuning'
import { FIRST_REBEL_LEVEL } from '../../../src/game/levels'
import { floors } from '../core/floors'
import { startDay } from '../core/state'
import { drawDay } from './draw'
import { palette } from './palette'

const { enabled: _enabled, ...tuning } = gameDefaults

/** A 2D context that does nothing but remember the text and rectangles it
 * was asked to draw, and the transform in force. */
function recorder(): {
  ctx: CanvasRenderingContext2D
  texts: unknown[][]
  rects: { fill: unknown; x: number; y: number }[]
} {
  const texts: unknown[][] = []
  const rects: { fill: unknown; x: number; y: number }[] = []
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
      if (key === 'fillRect')
        return (x: number, y: number) =>
          rects.push({ fill: target['fillStyle'], x, y })
      if (typeof key === 'string' && key in target) return target[key]
      return () => undefined
    },
    set: (target, key, value) => {
      target[key as string] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, rects }
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
      ['CR', (9 + 0.5 - 2) * 40, (3 + 0.47) * 40, 'bold 8px sans-serif'],
    ])
  })

  it('stacks files on the player’s desk in boss mode only (R-GAME-4)', () => {
    const pal = palette(() => '')
    const view = { x: 0, y: 0, width: 10, height: 9 }
    const filesOnDesk = (level: number): number => {
      const day = startDay(level, tuning, 1)
      const { ctx, rects } = recorder()
      drawDay(ctx, day, view, pal, 40)
      const { desk } = floors[day.floor]
      const left = desk[0]?.x ?? 0
      return rects.filter(
        (r) =>
          r.fill === pal.paper &&
          r.x >= left &&
          r.x < left + desk.length &&
          Math.floor(r.y) === desk[0]?.y,
      ).length
    }

    expect(filesOnDesk(1)).toBe(5)
    expect(filesOnDesk(FIRST_REBEL_LEVEL)).toBe(0)
  })
})
