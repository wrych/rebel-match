import { describe, expect, it } from 'vitest'
import { layout, layoutDefaults, type Point } from './layout'

const distance = (a?: Point, b?: Point): number =>
  a === undefined || b === undefined
    ? Number.NaN
    : Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

describe('layout (R-NET-1)', () => {
  const links = [
    { source: 0, target: 1 },
    { source: 1, target: 2 },
    { source: 0, target: 2 },
  ]

  it('lays a network out the same way every time', () => {
    expect(layout(6, links)).toEqual(layout(6, links))
  })

  it('places linked members closer than unlinked ones', () => {
    const points = layout(6, links)

    expect(distance(points[0], points[1])).toBeLessThan(
      distance(points[0], points[4]),
    )
  })

  it('gives every member a finite point', () => {
    const points = layout(40, links, { ...layoutDefaults, iterations: 30 })

    expect(points).toHaveLength(40)
    for (const point of points)
      expect([point.x, point.y, point.z].every(Number.isFinite)).toBe(true)
  })

  it('ignores a link to a node it does not have', () => {
    expect(() => layout(2, [{ source: 0, target: 9 }])).not.toThrow()
  })
})
