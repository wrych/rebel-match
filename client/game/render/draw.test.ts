import { describe, expect, it, vi } from 'vitest'
import { gameDefaults } from '../../../src/game/tuning'
import { FIRST_REBEL_LEVEL } from '../../../src/game/levels'
import { floors } from '../core/floors'
import { startDay } from '../core/state'
import { drawDay } from './draw'
import { palette } from './palette'
import { MARK_HAPPY_BANDS } from '../../lib/mark'

const { enabled: _enabled, ...tuning } = gameDefaults

/** A 2D context that does nothing but remember the rectangles it was asked
 * to draw, the widths of the rounded ones and its clips in order, and the
 * transform in force. */
function recorder(): {
  ctx: CanvasRenderingContext2D
  rects: { fill: unknown; x: number; y: number }[]
  shapes: (number | 'clip')[]
} {
  const rects: { fill: unknown; x: number; y: number }[] = []
  const shapes: (number | 'clip')[] = []
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
      if (key === 'roundRect')
        return (_x: number, _y: number, w: number) => shapes.push(w)
      if (key === 'clip') return () => shapes.push('clip')
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
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, shapes }
}

describe('drawDay', () => {
  it('puts the happy mark on a tempted employee’s screen, and only there (R-GAME-18, R-LOOK-5)', () => {
    vi.stubGlobal(
      'Path2D',
      class {
        addPath(): void {}
      },
    )
    const pal = palette(() => '')
    const view = { x: 2, y: 0, width: 10, height: 9 }
    const bandsDrawn = (tempted: boolean): unknown[] => {
      const day = startDay(1, tuning, 1)
      const employee = day.employees[0]
      if (employee === undefined) throw new Error('no employee')
      if (tempted) employee.spirit = 'tempted'
      const { ctx, rects } = recorder()
      drawDay(ctx, day, view, pal, 40)
      return rects
        .map((r) => r.fill)
        .filter((fill) =>
          (MARK_HAPPY_BANDS as readonly unknown[]).includes(fill),
        )
    }

    expect(bandsDrawn(true)).toEqual(MARK_HAPPY_BANDS)
    expect(bandsDrawn(false)).toEqual([])
    vi.unstubAllGlobals()
  })

  it('fills a tempted employee’s screen with the mark, cropped to the screen (R-GAME-18)', () => {
    vi.stubGlobal(
      'Path2D',
      class {
        addPath(): void {}
      },
    )
    const day = startDay(1, tuning, 1)
    const employee = day.employees[0]
    if (employee === undefined) throw new Error('no employee')
    employee.spirit = 'tempted'
    const { ctx, shapes } = recorder()

    drawDay(
      ctx,
      day,
      { x: 2, y: 0, width: 10, height: 9 },
      palette(() => ''),
      40,
    )

    const clip = shapes.indexOf('clip')
    const [screen, mark] = [shapes[clip - 1], shapes[clip + 1]]
    expect(typeof screen).toBe('number')
    expect(mark).toBeGreaterThan(screen as number)
    vi.unstubAllGlobals()
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
