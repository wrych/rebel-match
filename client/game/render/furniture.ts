import { floors, type Floor, type Spot } from '../core/floors'
import type { DayState, Employee } from '../core/state'
import type { Palette } from './palette'
import {
  circle,
  drawFile,
  drawLabel,
  outline,
  roundRect,
  type Ctx,
} from './shapes'

/** How far the front edge of a block shows below its top. */
const LIP = 0.1
const LOGO_SIZE = 0.2
/** How many files lie on the player's desk in boss mode. */
const STACK = 5

// A block seen from above and a little in front: a darker front edge, then
// the top over it.
function drawBlock(
  ctx: Ctx,
  at: Spot,
  size: { w: number; h: number },
  pal: Palette,
): void {
  ctx.fillStyle = pal.edge
  roundRect(ctx, at.x, at.y + LIP, size.w, size.h, 0.08)
  ctx.fillStyle = pal.furniture
  roundRect(ctx, at.x, at.y, size.w, size.h, 0.08)
  outline(ctx)
}

/** An office chair seen from above, its back towards `back` (1 south, -1
 * north). */
function drawChair(ctx: Ctx, centre: Spot, back: 1 | -1, pal: Palette): void {
  ctx.fillStyle = 'rgb(0 0 0 / 15%)'
  ctx.beginPath()
  ctx.ellipse(centre.x, centre.y + 0.08, 0.32, 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = pal.chair
  roundRect(ctx, centre.x - 0.26, centre.y - 0.22, 0.52, 0.44, 0.12)
  outline(ctx)
  ctx.fillStyle = pal.bezel
  roundRect(ctx, centre.x - 0.3, centre.y + back * 0.26 - 0.08, 0.6, 0.16, 0.07)
}

/** A monitor facing the viewer: frame, screen, neck and foot. */
function drawMonitor(
  ctx: Ctx,
  screen: { x: number; y: number; w: number; h: number },
  colour: string,
  pal: Palette,
): void {
  const centre = screen.x + screen.w / 2
  ctx.fillStyle = pal.bezel
  ctx.fillRect(centre - 0.04, screen.y + screen.h, 0.08, 0.08)
  roundRect(ctx, centre - 0.12, screen.y + screen.h + 0.06, 0.24, 0.05, 0.02)
  roundRect(
    ctx,
    screen.x - 0.05,
    screen.y - 0.05,
    screen.w + 0.1,
    screen.h + 0.1,
    0.05,
  )
  ctx.fillStyle = colour
  roundRect(ctx, screen.x, screen.y, screen.w, screen.h, 0.03)
}

function drawKeyboard(ctx: Ctx, at: Spot, width: number, pal: Palette): void {
  ctx.fillStyle = pal.bezel
  roundRect(ctx, at.x, at.y, width, 0.08, 0.02)
  ctx.fillStyle = pal.screen
  ctx.fillRect(at.x + 0.03, at.y + 0.025, width - 0.06, 0.03)
}

const deskScreen = (
  desk: Spot,
): { x: number; y: number; w: number; h: number } => ({
  x: desk.x + 0.25,
  y: desk.y + 0.22,
  w: 0.5,
  h: 0.34,
})

function drawCubicle(ctx: Ctx, desk: Spot, seat: Spot, pal: Palette): void {
  drawChair(ctx, { x: seat.x + 0.5, y: seat.y + 0.45 }, 1, pal)
  drawBlock(
    ctx,
    { x: desk.x + 0.04, y: desk.y + 0.1 },
    { w: 0.92, h: 0.72 },
    pal,
  )
  drawMonitor(ctx, deskScreen(desk), pal.screen, pal)
  drawKeyboard(ctx, { x: desk.x + 0.3, y: desk.y + 0.7 }, 0.4, pal)
  ctx.fillStyle = pal.bezel
  circle(ctx, { x: desk.x + 0.8, y: desk.y + 0.74 }, 0.04)
}

function drawStack(ctx: Ctx, at: Spot, pal: Palette): void {
  for (let sheet = 0; sheet < STACK; sheet += 1)
    drawFile(
      ctx,
      { x: at.x + (sheet % 2) * 0.03, y: at.y - sheet * 0.045 },
      pal,
    )
}

/** The player's desk, two tiles wide: a chair in front, a wide screen, and
 * the stack of files in boss mode (R-GAME-4). */
function drawOwnDesk(
  ctx: Ctx,
  state: DayState,
  floor: Floor,
  pal: Palette,
): void {
  const left = Math.min(...floor.desk.map((tile) => tile.x))
  const width = floor.desk.length
  const top = floor.cabinet.y
  const centre = left + width / 2
  drawChair(ctx, { x: centre, y: top + 1.45 }, 1, pal)
  drawBlock(
    ctx,
    { x: left + 0.04, y: top + 0.1 },
    { w: width - 0.08, h: 0.74 },
    pal,
  )
  const boss = state.mode === 'boss'
  const colour = boss ? pal.screen : (pal.rebel[0] ?? pal.screen)
  drawMonitor(
    ctx,
    { x: centre - 0.42, y: top + 0.2, w: 0.84, h: 0.4 },
    colour,
    pal,
  )
  drawKeyboard(ctx, { x: centre - 0.3, y: top + 0.73 }, 0.6, pal)
  ctx.fillStyle = pal.paper
  circle(ctx, { x: left + width - 0.24, y: top + 0.42 }, 0.08)
  outline(ctx)
  if (boss) drawStack(ctx, { x: left + 0.1, y: top + 0.4 }, pal)
}

function drawCoolers(ctx: Ctx, floor: Floor, pal: Palette): void {
  for (const { cooler } of floor.coolers) {
    drawBlock(
      ctx,
      { x: cooler.x + 0.2, y: cooler.y + 0.35 },
      { w: 0.6, h: 0.5 },
      pal,
    )
    ctx.fillStyle = pal.paper
    roundRect(ctx, cooler.x + 0.3, cooler.y + 0.05, 0.4, 0.4, 0.15)
    outline(ctx)
  }
}

/** Everything that stands on the floor but the screens' content. */
export function drawFurniture(ctx: Ctx, state: DayState, pal: Palette): void {
  const floor = floors[state.floor]
  for (const { desk, seat } of floor.cubicles) drawCubicle(ctx, desk, seat, pal)
  drawOwnDesk(ctx, state, floor, pal)
  drawBlock(
    ctx,
    { x: floor.table.x - 0.3, y: floor.table.y + 0.05 },
    { w: 1.6, h: 0.8 },
    pal,
  )
  drawCoolers(ctx, floor, pal)
}

function screenColour(employee: Employee, pal: Palette): string {
  if (employee.spirit === 'grey') return pal.screen
  return pal.rebel[employee.id % pal.rebel.length] ?? pal.screen
}

/** Each employee's screen in their colour, a tempted one's with the CR logo
 * so the state reads by shape as well as colour, and the file they were
 * handed (R-GAME-18). */
export function drawScreens(ctx: Ctx, state: DayState, pal: Palette): void {
  floors[state.floor].cubicles.forEach(({ desk }, index) => {
    const employee = state.employees.find((e) => e.cubicle === index)
    if (employee === undefined) return
    const screen = deskScreen(desk)
    ctx.fillStyle = screenColour(employee, pal)
    roundRect(ctx, screen.x, screen.y, screen.w, screen.h, 0.03)
    if (employee.spirit === 'tempted')
      drawLabel(
        ctx,
        'CR',
        { x: screen.x + screen.w / 2, y: screen.y + screen.h / 2 },
        LOGO_SIZE,
        pal,
      )
    if (employee.file)
      drawFile(ctx, { x: desk.x + 0.05, y: desk.y + 0.44 }, pal)
  })
}
