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

describe('haloOf (R-RECAP-5)', () => {
  it('centres on the member, vivid, and fades the rest by distance', () => {
    const halo = haloOf(timeline(40, 0), line(40), 0)

    const self = halo?.dots.at(-1)
    expect(self).toMatchObject({ x: 0, y: -0, fade: 1, self: true })
    const others = halo?.dots.filter((dot) => !dot.self) ?? []
    const byDistance = [...others].sort((a, b) => a.x - b.x)
    expect(byDistance.map((dot) => dot.fade)).toEqual(
      [...byDistance.map((dot) => dot.fade)].sort((a, b) => b - a),
    )
    expect(others.every((dot) => dot.fade < 1 && dot.fade > 0)).toBe(true)
  })

  it('leaves out what has faded to nothing', () => {
    const halo = haloOf(timeline(40, 0), line(40), 0)

    expect(halo?.dots.length).toBeLessThan(40)
    expect(
      Math.max(...(halo?.dots ?? []).map((dot) => Math.abs(dot.x))),
    ).toBeLessThanOrEqual(1)
  })

  it('fades a line as its fainter end', () => {
    const halo = haloOf(timeline(40, 0), line(40), 0)
    const fades = halo?.dots.map((dot) => dot.fade) ?? []

    expect(halo?.lines.map((each) => each.fade)).toEqual([
      expect.any(Number),
      expect.any(Number),
    ])
    expect(halo?.lines[1]?.fade).toBeLessThan(halo?.lines[0]?.fade ?? 0)
    expect(Math.max(...fades)).toBe(1)
  })

  it('turns with the angle, the member staying in the middle', () => {
    const flat = haloOf(timeline(40, 0), line(40), 0)
    const turned = haloOf(timeline(40, 0), line(40), Math.PI / 2)

    expect(turned?.dots.at(-1)).toMatchObject({ x: 0, self: true })
    expect(turned?.dots[0]?.x).not.toBeCloseTo(flat?.dots[0]?.x ?? 0)
  })

  it('shows nothing when the timeline marks nobody', () => {
    expect(haloOf(timeline(3, -1), line(3), 0)).toBeNull()
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
    const halo = haloOf(timeline(40, 0), line(40), 0)
    if (halo === null) throw new Error('no halo')

    paintHalo(
      pen,
      halo,
      { x: 0, y: 0, size: 100 },
      {
        accent: '#d4471f',
        ink: '#111010',
        paper: '#faf8f4',
      },
    )

    expect(calls.indexOf('stroke')).toBeLessThan(calls.indexOf('arc'))
    expect(pen.fillStyle).toBe('#d4471f')
    expect(pen.globalAlpha).toBe(1)
  })
})
