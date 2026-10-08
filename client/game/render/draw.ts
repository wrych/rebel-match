import { floors, TILE, type Floor } from '../core/floors'
import { wallParts } from '../core/walls'
import type { DayState, Employee } from '../core/state'
import { drawFigure, type Figure } from './figure'
import { drawDoor, drawFurniture, drawScreens } from './furniture'
import { lookOf, type Palette } from './palette'
import { TAU, type Ctx } from './shapes'
import { markers, type View } from './view'

function tileColour(tile: string, pal: Palette): string {
  if (tile === TILE.office || tile === TILE.cabinet) return pal.office
  if (tile === TILE.meeting || tile === TILE.table) return pal.meeting
  return pal.floor
}

const roomColour = (
  floor: Floor,
  pal: Palette,
  x: number,
  y: number,
): string | null => {
  const tile = floor.rows[y]?.[x]
  return tile === undefined || tile === TILE.wall ? null : tileColour(tile, pal)
}

const QUARTERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]

// Around its thin wall, each quarter of a wall tile takes the colour of the
// room on that side; a quarter beyond the floor stays outside.
function drawAroundWall(
  ctx: Ctx,
  floor: Floor,
  pal: Palette,
  at: { x: number; y: number },
): void {
  for (const [dx, dy] of QUARTERS) {
    const colour =
      roomColour(floor, pal, at.x + dx, at.y) ??
      roomColour(floor, pal, at.x, at.y + dy) ??
      roomColour(floor, pal, at.x + dx, at.y + dy)
    if (colour === null) continue
    ctx.fillStyle = colour
    ctx.fillRect(at.x + (dx + 1) / 4, at.y + (dy + 1) / 4, 0.52, 0.52)
  }
}

const wallAt = (floor: Floor, x: number, y: number): boolean =>
  floor.rows[y]?.[x] === TILE.wall

// A door or the entrance: a gap in a wall, split between the rooms it joins.
const inWallLine = (
  floor: Floor,
  { x, y }: { x: number; y: number },
): boolean =>
  (wallAt(floor, x - 1, y) && wallAt(floor, x + 1, y)) ||
  (wallAt(floor, x, y - 1) && wallAt(floor, x, y + 1))

function drawTile(
  ctx: Ctx,
  floor: Floor,
  pal: Palette,
  at: { x: number; y: number },
): void {
  const tile = floor.rows[at.y]?.[at.x] ?? TILE.wall
  if (tile === TILE.wall || inWallLine(floor, at)) {
    drawAroundWall(ctx, floor, pal, at)
    return
  }
  ctx.fillStyle = tileColour(tile, pal)
  ctx.fillRect(at.x, at.y, 1.02, 1.02)
}

function drawWall(
  ctx: Ctx,
  floor: Floor,
  pal: Palette,
  at: { x: number; y: number },
): void {
  if (floor.rows[at.y]?.[at.x] !== TILE.wall) return
  ctx.fillStyle = pal.wall
  for (const part of wallParts(floor, at.x, at.y))
    ctx.fillRect(part.x, part.y, part.w + 0.01, part.h + 0.01)
}

type TileDrawer = (
  ctx: Ctx,
  floor: Floor,
  pal: Palette,
  at: { x: number; y: number },
) => void

function eachTile(
  ctx: Ctx,
  floor: Floor,
  view: View,
  pal: Palette,
  draw: TileDrawer,
): void {
  const top = Math.max(0, Math.floor(view.y))
  const left = Math.max(0, Math.floor(view.x))
  const bottom = Math.min(floor.height, Math.ceil(view.y + view.height) + 1)
  const right = Math.min(floor.width, Math.ceil(view.x + view.width) + 1)
  for (let y = top; y < bottom; y += 1)
    for (let x = left; x < right; x += 1) draw(ctx, floor, pal, { x, y })
}

// Outside first, then the rooms, then the thin walls over their edges.
function drawTiles(ctx: Ctx, floor: Floor, view: View, pal: Palette): void {
  ctx.fillStyle = pal.outside
  ctx.fillRect(view.x - 1, view.y - 1, view.width + 2, view.height + 2)
  eachTile(ctx, floor, view, pal, drawTile)
  eachTile(ctx, floor, view, pal, drawWall)
}

function figureOf(state: DayState, employee: Employee): Figure {
  const rebel = employee.spirit !== 'grey'
  return {
    look: lookOf(employee.id),
    grey: !rebel,
    rebel: employee.spirit === 'rebel',
    slumped: state.mode === 'rebel' && employee.spirit === 'grey',
    heat: employee.heat,
    carrying: false,
    boss: false,
  }
}

function drawPlayer(ctx: Ctx, state: DayState, pal: Palette): void {
  const rebel = state.mode === 'rebel'
  drawFigure(
    ctx,
    state.player.position,
    {
      look: {
        skin: '#d9a77f',
        hair: '#2b2522',
        suit: rebel ? (pal.rebel[0] ?? '#111') : '#1c1c1c',
        rebelHair: 3,
        hairStyle: 1,
      },
      grey: false,
      rebel,
      slumped: false,
      heat: 0,
      carrying: state.player.carrying,
      boss: true,
    },
    pal,
  )
  drawBusy(ctx, state, pal)
}

function drawBusy(ctx: Ctx, state: DayState, pal: Palette): void {
  const busy = state.player.busy
  if (busy === null) return
  const left = Math.max(0, busy.until - state.clock)
  const at = state.player.position
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = 0.07
  ctx.beginPath()
  ctx.arc(
    at.x,
    at.y - 0.65,
    0.16,
    -Math.PI / 2,
    -Math.PI / 2 + TAU / (1 + left),
  )
  ctx.stroke()
}

function drawMarkers(
  ctx: Ctx,
  state: DayState,
  view: View,
  pal: Palette,
): void {
  ctx.fillStyle = pal.rebel[0] ?? pal.ink
  for (const marker of markers(state, view)) {
    ctx.save()
    ctx.translate(marker.at.x, marker.at.y)
    ctx.rotate(marker.angle)
    ctx.beginPath()
    ctx.moveTo(0.25, 0)
    ctx.lineTo(-0.15, -0.18)
    ctx.lineTo(-0.15, 0.18)
    ctx.fill()
    ctx.restore()
  }
}

function drawChosen(
  ctx: Ctx,
  state: DayState,
  chosen: ReadonlySet<number>,
  pal: Palette,
): void {
  ctx.strokeStyle = pal.rebel[0] ?? pal.ink
  ctx.lineWidth = 0.08
  for (const employee of state.employees) {
    if (!chosen.has(employee.id)) continue
    ctx.beginPath()
    ctx.ellipse(
      employee.position.x,
      employee.position.y + 0.3,
      0.42,
      0.18,
      0,
      0,
      TAU,
    )
    ctx.stroke()
  }
}

/** Draws the day as the view shows it, `scale` pixels to a tile, ringing
 * the employees chosen for a masterclass. */
export function drawDay(
  ctx: Ctx,
  state: DayState,
  view: View,
  pal: Palette,
  scale: number,
  chosen: ReadonlySet<number> = new Set(),
): void {
  const floor = floors[state.floor]
  ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale)
  drawTiles(ctx, floor, view, pal)
  drawFurniture(ctx, state, pal)
  drawScreens(ctx, state, pal)
  drawDoor(ctx, state, pal)
  const people = [...state.employees].sort(
    (a, b) => a.position.y - b.position.y,
  )
  for (const employee of people) {
    if (employee.doing.kind === 'away') continue
    drawFigure(ctx, employee.position, figureOf(state, employee), pal)
  }
  drawChosen(ctx, state, chosen, pal)
  drawPlayer(ctx, state, pal)
  drawMarkers(ctx, state, view, pal)
}
