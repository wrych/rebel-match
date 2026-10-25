import { describe, expect, it } from 'vitest'
import {
  fitOf,
  goalOf,
  poseOf,
  positionOf,
  reach,
  stepTo,
  steering,
  type Pose,
} from './camera'

const points = [
  { x: 0, y: 0, z: 10 },
  { x: 0, y: 30, z: 0 },
  { x: -100, y: 0, z: 0 },
]
const ORIGIN = { x: 0, y: 0, z: 0 }
const FIT = 3

describe('reach', () => {
  it('measures the farthest of the points shown', () => {
    expect(reach(points, 2)).toBe(30)
    expect(reach(points)).toBe(100)
    expect(reach([], 5)).toBe(0)
  })
})

describe('goalOf (R-NET-1, R-NET-2)', () => {
  it('stands back from the network as far as it has grown', () => {
    const early = goalOf(points, 2, null, 10, FIT)
    const late = goalOf(points, 3, null, 10, FIT)

    expect(early.target).toEqual(ORIGIN)
    expect(late.distance).toBeGreaterThan(early.distance)
    expect(late.distance).toBe(100 * FIT)
  })

  it('never comes closer than a share of the whole network', () => {
    expect(goalOf(points, 1, null, 10, FIT).distance).toBe(
      100 * steering.smallestShare * FIT,
    )
  })

  it('turns towards the viewer once the replay ends, keeping the network in view', () => {
    const self = { x: 0, y: 0, z: 80 }
    const lit = [...points, self]

    expect(goalOf(lit, 4, self, 10, FIT)).toEqual({
      target: { x: 0, y: 0, z: 80 * steering.focusPull },
      distance: 100 * steering.focusShare * FIT,
    })
  })

  it('keeps a floor for a network of one', () => {
    expect(goalOf([ORIGIN], 1, null, 10, FIT).distance).toBe(
      10 * steering.smallestShare * FIT,
    )
  })
})

describe('fitOf', () => {
  it('stands farther back on a narrow screen than a wide one', () => {
    expect(fitOf(50, 0.5)).toBeGreaterThan(fitOf(50, 1))
    expect(fitOf(50, 2)).toBeCloseTo(fitOf(50, 1))
  })

  it('fits a sphere with room around it', () => {
    expect(fitOf(60, 1)).toBeCloseTo(steering.margin / Math.sin(Math.PI / 6))
  })
})

describe('stepTo', () => {
  const pose: Pose = {
    target: { x: 10, y: 0, z: 0 },
    distance: 50,
    azimuth: 1,
    elevation: 0,
  }
  const goal = { target: ORIGIN, distance: 100 }

  it('eases towards the goal and keeps turning', () => {
    const next = stepTo(pose, goal, steering.easeMs, false)

    expect(next.distance).toBeGreaterThan(50)
    expect(next.distance).toBeLessThan(100)
    expect(next.target.x).toBeLessThan(10)
    expect(next.azimuth).toBeGreaterThan(1)
  })

  it('keeps turning once at the goal, as the replay rests', () => {
    const settled = stepTo(
      { ...pose, ...goal, elevation: steering.elevation },
      goal,
      1000,
      false,
    )

    expect(settled.distance).toBe(100)
    expect(settled.azimuth).toBeCloseTo(1 + 1000 * steering.turnPerMs)
  })

  it('is at the goal at once and still, for reduced motion (R-NET-9)', () => {
    const next = stepTo(pose, goal, 16, true)

    expect(next).toEqual({
      target: ORIGIN,
      distance: 100,
      azimuth: 1,
      elevation: steering.elevation,
    })
  })

  it('stays put for no time passed', () => {
    expect(stepTo(pose, goal, 0, false)).toEqual(pose)
  })
})

describe('poseOf and positionOf', () => {
  it('turn a position into a pose and back', () => {
    const target = { x: 5, y: -2, z: 1 }
    const position = { x: 25, y: 13, z: -9 }
    const back = positionOf(poseOf(position, target))

    expect(back.x).toBeCloseTo(position.x)
    expect(back.y).toBeCloseTo(position.y)
    expect(back.z).toBeCloseTo(position.z)
  })

  it('stays clear of straight up, where the turn has no meaning', () => {
    const pose = poseOf({ x: 0, y: 40, z: 0 }, ORIGIN)

    expect(pose.elevation).toBeLessThan(Math.PI / 2)
    expect(pose.distance).toBe(40)
  })

  it('survives a camera standing on its target', () => {
    expect(poseOf(ORIGIN, ORIGIN).distance).toBe(1)
  })
})
