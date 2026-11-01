import { describe, expect, it } from 'vitest'
import type { NetworkTimeline } from '../lib/network'
import type { Point } from '../network/layout'
import { haloOf, mix, paintHalo, type HaloPen } from './halo'

const line = (n: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0, z: 0 }))

const timeline = (n: number, self: number): NetworkTimeline => ({
  nodes: Array.from({ length: n }, (_, id) => ({
    id,
    at: 0,
    day: '2026-10-01',
    self: id === self,
  })),
  links: [
    { source: 0, target: 1, at: 0, day: '2026-10-01' },
    { source: 1, target: 2, at: 0, day: '2026-10-01' },
  ],
  moons: [],
  own: null,
})

const frame = {
  self: { x: 80, y: 80 },
  toward: { x: 50, y: 50 },
  stretch: 1,
}

describe('haloOf (R-RECAP-5)', () => {
  it('puts the member where the frame says, vivid', () => {
    const halo = haloOf(timeline(40, 0), line(40), 0, frame)

    const self = halo?.dots.at(-1)
    expect(self?.self).toBe(true)
    expect(self?.x).toBeCloseTo(80)
    expect(self?.y).toBeCloseTo(80)
    expect(self?.fade).toBe(1)
  })

  it('lays the network’s centre towards the frame’s centre, as far as the stretch says', () => {
    // On a line of 40 dots ten apart, the centre is at 195, under dot 19.5.
    const stretched = { ...frame, stretch: 2 }
    const halo = haloOf(timeline(40, 0), line(40), 0, stretched)
    const flat = haloOf(timeline(40, 0), line(40), 0, frame)
    const dot10 = (h: typeof halo): { x: number; y: number } | undefined =>
      h?.dots.find(
        (dot) => !dot.self && Math.abs(dot.x - dot.y) < 1e-9 && dot.x < 80,
      )

    expect(dot10(flat)).toBeDefined()
    expect((dot10(halo)?.x ?? 0) - 80).toBeCloseTo(
      ((dot10(flat)?.x ?? 0) - 80) * 2,
    )
  })

  it('fades the rest gently by their distance from the member', () => {
    const halo = haloOf(timeline(40, 0), line(40), 0, frame)
    const others = halo?.dots.filter((dot) => !dot.self) ?? []

    const byNearness = [...others].sort((a, b) => b.x - a.x)
    expect(byNearness.map((dot) => dot.fade)).toEqual(
      [...byNearness.map((dot) => dot.fade)].sort((a, b) => b - a),
    )
    expect(others.every((dot) => dot.fade > 0 && dot.fade < 1)).toBe(true)
    expect(others.length).toBeGreaterThan(30)
  })

  it('fades a line as its fainter end', () => {
    const halo = haloOf(timeline(40, 0), line(40), 0, frame)

    expect(halo?.lines).toHaveLength(2)
    expect(halo?.lines[1]?.fade).toBeLessThan(halo?.lines[0]?.fade ?? 0)
  })

  it('turns about the line to the centre, what lies on it staying put', () => {
    // The centre is at x 7.5 on the x axis: dot 1 lies on that line, dot 2
    // off it.
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 6, z: 0 },
      { x: 10, y: -6, z: 0 },
    ]
    const nodes = timeline(4, 0)
    const where = (angle: number): Map<string, { x: number; y: number }> => {
      const halo = haloOf(nodes, points, angle, frame)
      const others = (halo?.dots ?? []).filter((dot) => !dot.self)
      // Dots 2 and 3 are as far as each other, so the fade tells dot 1.
      const onAxis = others.reduce((a, b) => (a.fade > b.fade ? a : b))
      const offAxis = others.find((dot) => dot !== onAxis)
      return new Map([
        ['self', halo?.dots.at(-1) ?? { x: 0, y: 0 }],
        ['on', onAxis],
        ['off', offAxis ?? { x: 0, y: 0 }],
      ])
    }

    expect(where(1).get('self')).toMatchObject({ x: 80, y: 80 })
    expect(where(1).get('on')?.x).toBeCloseTo(where(0).get('on')?.x ?? 0)
    expect(where(1).get('off')?.x).not.toBeCloseTo(where(0).get('off')?.x ?? 0)
  })

  it('shows nothing when the timeline marks nobody', () => {
    expect(haloOf(timeline(3, -1), line(3), 0, frame)).toBeNull()
  })

  it('frames a member alone at the centre without breaking', () => {
    const halo = haloOf(timeline(1, 0), [{ x: 0, y: 0, z: 0 }], 0, frame)

    expect(halo?.dots).toEqual([{ x: 80, y: 80, fade: 1, self: true }])
  })
})

describe('mix', () => {
  it('moves one colour towards another', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#111010', '#faf8f4', 0)).toBe('#111010')
  })

  it('keeps a colour that is not plain hex', () => {
    expect(mix('rgb(0 0 0)', '#ffffff', 0.5)).toBe('rgb(0 0 0)')
  })
})

describe('paintHalo', () => {
  it('draws lines, then dots, the member last in the accent, and resets the opacity', () => {
    const calls: string[] = []
    const pen = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
      beginPath: () => undefined,
      arc: () => calls.push('arc'),
      fill: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => calls.push('stroke'),
    } as unknown as HaloPen & { fillStyle: string; globalAlpha: number }
    const halo = haloOf(timeline(40, 0), line(40), 0, frame)
    if (halo === null) throw new Error('no halo')

    paintHalo(pen, halo, 100, {
      accent: '#d4471f',
      ink: '#111010',
      paper: '#faf8f4',
      strength: 0.5,
    })

    expect(calls.indexOf('stroke')).toBeLessThan(calls.indexOf('arc'))
    expect(pen.fillStyle).toBe('#d4471f')
    expect(pen.globalAlpha).toBe(1)
  })
})
