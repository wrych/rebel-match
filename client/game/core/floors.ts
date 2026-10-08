import type { BossJob } from '../../../src/game/tuning'

/** A spot on the floor, in tiles. */
export interface Spot {
  x: number
  y: number
}

/** One employee's place: the desk and the chair in front of it. */
export interface Cubicle {
  desk: Spot
  seat: Spot
}

/** A floor plan as the rules read it (R-GAME-2). */
export interface Floor {
  width: number
  height: number
  /** One string per row; see `TILE`. */
  rows: readonly string[]
  entrance: Spot
  /** Where the player starts, beside their desk. */
  start: Spot
  /** The first tile of the player's desk, where the files are kept in boss
   * mode and the masterclass is called in rebel mode. */
  cabinet: Spot
  /** Every tile of the player's desk, which is two wide. */
  desk: readonly Spot[]
  /** The meeting room's door, from which "nearest" is measured. */
  meetingDoor: Spot
  /** Where those in a meeting stand, nearest the table first. */
  meetingSpots: readonly Spot[]
  /** The meeting table. */
  table: Spot
  cubicles: readonly Cubicle[]
  /** The tile beside each cooler where two can stand. */
  coolers: readonly { cooler: Spot; stands: readonly [Spot, Spot] }[]
}

/** What each character of a floor's rows means. */
export const TILE = {
  wall: '#',
  floor: '.',
  office: 'O',
  meeting: 'M',
  table: 'T',
  cabinet: 'K',
  desk: 'd',
  seat: 's',
  cooler: 'W',
  entrance: 'E',
} as const

const BLOCKING: ReadonlySet<string> = new Set([
  TILE.wall,
  TILE.table,
  TILE.cabinet,
  TILE.desk,
  TILE.cooler,
])

/** Whether nobody can walk on the tile at x, y. */
export function blocked(floor: Floor, x: number, y: number): boolean {
  const row = floor.rows[y]
  if (row === undefined) return true
  return BLOCKING.has(row[x] ?? TILE.wall)
}

/** Whether the tile at x, y is part of the meeting room. */
export function inMeetingRoom(floor: Floor, x: number, y: number): boolean {
  return floor.rows[Math.floor(y)]?.[Math.floor(x)] === TILE.meeting
}

interface Layout {
  rows: number
  perRow: number
  coolers: number
}

// The rooms on the left are this many tiles wide and tall, inside walls.
const ROOM = 5
const LEFT = ROOM + 2
const CUBICLE_WIDTH = 3
const CUBICLE_HEIGHT = 3
const COOLER_GAP = 5
const MIN_HEIGHT = 2 * ROOM + 3
const TABLE: Spot = { x: 3, y: ROOM + 4 }

type Grid = string[][]

function blank(width: number, height: number): Grid {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1
        ? TILE.wall
        : TILE.floor,
    ),
  )
}

function fill(grid: Grid, from: Spot, to: Spot, tile: string): void {
  for (let y = from.y; y <= to.y; y += 1) {
    const row = grid[y]
    for (let x = from.x; x <= to.x && row !== undefined; x += 1) row[x] = tile
  }
}

function put(grid: Grid, spot: Spot, tile: string): void {
  const row = grid[spot.y]
  if (row !== undefined) row[spot.x] = tile
}

// The office above, the meeting room below, each with a door to the right.
function rooms(
  grid: Grid,
  height: number,
): { door: Spot; cabinet: Spot; desk: Spot[] } {
  fill(grid, { x: 1, y: 1 }, { x: ROOM, y: ROOM }, TILE.office)
  fill(grid, { x: ROOM + 1, y: 0 }, { x: ROOM + 1, y: height - 1 }, TILE.wall)
  fill(grid, { x: 0, y: ROOM + 1 }, { x: ROOM + 1, y: ROOM + 1 }, TILE.wall)
  fill(grid, { x: 1, y: ROOM + 2 }, { x: ROOM, y: height - 2 }, TILE.meeting)
  const cabinet = { x: 2, y: 2 }
  const desk = [cabinet, { x: cabinet.x + 1, y: cabinet.y }]
  for (const tile of desk) put(grid, tile, TILE.cabinet)
  put(grid, TABLE, TILE.table)
  put(grid, { x: ROOM + 1, y: 3 }, TILE.office)
  const door = { x: ROOM + 1, y: ROOM + 4 }
  put(grid, door, TILE.meeting)
  return { door, cabinet, desk }
}

function cubicles(grid: Grid, layout: Layout): Cubicle[] {
  const placed: Cubicle[] = []
  for (let row = 0; row < layout.rows; row += 1) {
    for (let column = 0; column < layout.perRow; column += 1) {
      const desk = {
        x: LEFT + 2 + column * CUBICLE_WIDTH,
        y: 2 + row * CUBICLE_HEIGHT,
      }
      const seat = { x: desk.x, y: desk.y + 1 }
      put(grid, desk, TILE.desk)
      put(grid, seat, TILE.seat)
      placed.push({ desk, seat })
    }
  }
  return placed
}

function coolers(grid: Grid, width: number, count: number): Floor['coolers'] {
  return Array.from({ length: count }, (_, index) => {
    const cooler = { x: width - 2, y: 3 + index * COOLER_GAP }
    put(grid, cooler, TILE.cooler)
    const stands: [Spot, Spot] = [
      { x: cooler.x - 1, y: cooler.y },
      { x: cooler.x - 1, y: cooler.y + 1 },
    ]
    return { cooler, stands }
  })
}

function meetingSpots(rows: readonly string[]): Spot[] {
  const spots: Spot[] = []
  rows.forEach((row, y) => {
    for (let x = 1; x <= ROOM; x += 1)
      if (row[x] === TILE.meeting) spots.push({ x, y })
  })
  const far = (spot: Spot): number =>
    Math.abs(spot.x - TABLE.x) + Math.abs(spot.y - TABLE.y)
  return spots.sort((a, b) => far(a) - far(b) || a.y - b.y || a.x - b.x)
}

/** Lays out a floor: an office and a meeting room on the left, rows of
 * cubicles in the open plan, coolers along the right wall and the entrance
 * in the bottom wall. The same layout always gives the same floor. */
export function layOut(layout: Layout): Floor {
  const width = LEFT + 2 + layout.perRow * CUBICLE_WIDTH + 2
  const height = Math.max(MIN_HEIGHT, 3 + layout.rows * CUBICLE_HEIGHT + 1)
  const grid = blank(width, height)
  const { door, cabinet, desk } = rooms(grid, height)
  const placed = cubicles(grid, layout)
  const spots = coolers(grid, width, layout.coolers)
  const entrance = {
    x: LEFT + 1 + Math.floor((layout.perRow * CUBICLE_WIDTH) / 2),
    y: height - 1,
  }
  put(grid, entrance, TILE.entrance)
  const rows = grid.map((row) => row.join(''))
  return {
    width,
    height,
    rows,
    entrance,
    start: { x: cabinet.x + 2, y: cabinet.y + 1 },
    cabinet,
    desk,
    meetingDoor: door,
    meetingSpots: meetingSpots(rows),
    table: TABLE,
    cubicles: placed,
    coolers: spots,
  }
}

const layouts: Readonly<Record<BossJob, Layout>> = {
  teamLead: { rows: 2, perRow: 2, coolers: 0 },
  manager: { rows: 2, perRow: 4, coolers: 1 },
  director: { rows: 3, perRow: 5, coolers: 1 },
  vp: { rows: 4, perRow: 6, coolers: 2 },
  ceo: { rows: 4, perRow: 8, coolers: 2 },
}

/** The fixed floor of each job; rebel mode plays on the CEO's (R-GAME-2). */
export const floors: Readonly<Record<BossJob, Floor>> = {
  teamLead: layOut(layouts.teamLead),
  manager: layOut(layouts.manager),
  director: layOut(layouts.director),
  vp: layOut(layouts.vp),
  ceo: layOut(layouts.ceo),
}
