import { describe, expect, it } from 'vitest'
import { bossJobs, gameBounds, gameDefaults } from '../../../src/game/tuning'
import { blocked, floors, TILE } from './floors'
import { distancesFrom, path, walkingDistance } from './grid'

describe('floors (R-GAME-2)', () => {
  it.each(bossJobs)(
    'gives %s a cubicle for every employee a host may set',
    (job) => {
      const floor = floors[job]

      expect(floor.cubicles.length).toBeGreaterThanOrEqual(
        gameBounds[`${job}.employees`].max,
      )
      expect(floor.coolers.length).toBe(gameBounds[`${job}.coolers`].max)
    },
  )

  it.each(bossJobs)(
    'lets everyone on the %s floor reach every place they need',
    (job) => {
      const floor = floors[job]
      const fromEntrance = distancesFrom(floor, floor.entrance)
      const places = [
        floor.start,
        floor.meetingDoor,
        ...floor.meetingSpots,
        ...floor.cubicles.map((cubicle) => cubicle.seat),
        ...floor.coolers.flatMap((cooler) => cooler.stands),
      ]

      for (const place of places)
        expect(walkingDistance(fromEntrance, place)).toBeLessThan(Infinity)
    },
  )

  it('holds an office, a meeting room and a cooler where the plan says', () => {
    const floor = floors.manager

    expect(floor.rows[floor.cabinet.y]?.[floor.cabinet.x]).toBe(TILE.cabinet)
    expect(floor.rows[floor.entrance.y]?.[floor.entrance.x]).toBe(TILE.entrance)
    expect(floor.desk).toEqual([
      floor.cabinet,
      { x: floor.cabinet.x + 1, y: floor.cabinet.y },
    ])
    expect(floor.desk.every((tile) => blocked(floor, tile.x, tile.y))).toBe(
      true,
    )
    expect(blocked(floor, floor.start.x, floor.start.y)).toBe(false)
    expect(blocked(floor, -1, 0)).toBe(true)
    expect(floor.meetingSpots.length).toBeGreaterThanOrEqual(
      gameDefaults['ceo.meetingSeats'],
    )
  })

  it('lets everyone in beside the office, so they walk past the boss', () => {
    for (const floor of Object.values(floors)) {
      const { x, y } = floor.entrance
      expect(y).toBe(0)
      expect(floor.rows[1]?.[x - 1]).toBe(TILE.wall)
      expect(floor.rows[1]?.[x - 2]).toBe(TILE.office)
    }
  })

  it('walks a path of neighbouring tiles that ends where it should', () => {
    const floor = floors.teamLead
    const seat = floor.cubicles[3]?.seat ?? floor.start
    const steps = path(floor, floor.entrance, seat)

    expect(steps.at(-1)).toEqual(seat)
    expect(path(floor, seat, seat)).toEqual([])
    expect(path(floor, floor.entrance, floor.cabinet)).toEqual([])
  })
})
