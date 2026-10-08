import { describe, expect, it } from 'vitest'
import { floors } from './floors'
import { solidsOf, WALL, wallParts } from './walls'

const floor = floors.teamLead
const edge = (1 - WALL) / 2

describe('thin walls', () => {
  it('stands a thin post in a wall tile, with arms along the wall', () => {
    expect(wallParts(floor, 0, 3)).toEqual([
      { x: edge, y: 3 + edge, w: WALL, h: WALL },
      { x: edge, y: 3, w: WALL, h: edge },
      { x: edge, y: 3 + edge + WALL, w: WALL, h: edge },
    ])
  })

  it('reaches across to the door, so the doorway is a whole tile wide', () => {
    const { x } = floor.meetingDoor
    const above = wallParts(floor, x, floor.meetingDoor.y - 1)
    const bottom = Math.max(...above.map((part) => part.y + part.h))

    expect(bottom).toBe(floor.meetingDoor.y)
  })

  it('leaves a plant to its round obstacle, and blocks it for walkers', () => {
    for (const plant of floor.plants) {
      expect(solidsOf(floor, plant.x, plant.y)).toEqual([])
      expect(
        floor.obstacles.some(
          (o) => o.x === plant.x + 0.5 && o.y === plant.y + 0.5,
        ),
      ).toBe(true)
    }
  })
})
