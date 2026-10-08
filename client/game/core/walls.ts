import { blocked, TILE, type Floor } from './floors'

/** A rectangle, in tiles. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** How thick a wall is, drawn and felt, in tiles. */
export const WALL = 0.3

const isWall = (floor: Floor, x: number, y: number): boolean =>
  floor.rows[y]?.[x] === TILE.wall

// A wall reaches towards a wall beside it, and across to the edge of a gap one
// tile wide in its line, such as a door, so the gap is a whole tile wide.
const reaches = (
  floor: Floor,
  x: number,
  y: number,
  [dx, dy]: readonly [number, number],
): boolean =>
  isWall(floor, x + dx, y + dy) || isWall(floor, x + 2 * dx, y + 2 * dy)

const ARMS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

/** The solid parts of the wall tile at x, y: a post in its middle, and an arm
 * towards each side the wall goes on. */
export function wallParts(floor: Floor, x: number, y: number): Rect[] {
  const edge = (1 - WALL) / 2
  const post = { x: x + edge, y: y + edge, w: WALL, h: WALL }
  const arms = ARMS.filter((arm) => reaches(floor, x, y, arm)).map(
    ([dx, dy]): Rect =>
      dx === 0
        ? { x: post.x, y: dy < 0 ? y : post.y + WALL, w: WALL, h: edge }
        : { x: dx < 0 ? x : post.x + WALL, y: post.y, w: edge, h: WALL },
  )
  return [post, ...arms]
}

/** What a body bumps into on the tile at x, y: a wall's parts, a whole piece
 * of furniture, or nothing. Plants are round, and listed as obstacles. */
export function solidsOf(floor: Floor, x: number, y: number): Rect[] {
  const tile = floor.rows[y]?.[x]
  if (tile === undefined) return [{ x, y, w: 1, h: 1 }]
  if (tile === TILE.wall) return wallParts(floor, x, y)
  if (floor.plants.some((plant) => plant.x === x && plant.y === y)) return []
  return blocked(floor, x, y) ? [{ x, y, w: 1, h: 1 }] : []
}

/** Whether two rectangles overlap by more than a touch. */
export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
