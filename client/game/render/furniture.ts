import { floors, type Floor, type Spot, type Swing } from '../core/floors'
import { meetingDoorOpen } from '../core/boss'
import { LEAF_HALF, leafAt } from '../core/door'
import type { DayState, Employee } from '../core/state'
import { drawMark } from './mark'
import type { Palette } from './palette'
import { circle, drawFile, outline, roundRect, type Ctx } from './shapes'
import { WALL } from '../core/walls'

/** How far the front edge of a block shows below its top. */
const LIP = 0.1
/** How round a monitor's corners are. */
const MONITOR_RADIUS = 0.05
/** How much wider than a tempted employee's screen the mark is drawn, cropped
 * to the screen, so its letters fill it rather than its black square. */
const SCREEN_MARK_COVER = 1.12
/** How far a screen's light spills round the monitor's back. */
const GLOW = 0.05
/** An employee's desk as drawn on its two tiles: where it starts, how wide
 * it is, and where a file lies on it, right of the monitor (R-GAME-2). */
const DESK_LEFT = 0.2
const DESK_WIDTH = 1.5
const FILE_SPOT = { x: 1.1, y: 0.3 }
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

/** Where a worker's monitor stands, its back to the viewer. */
const deskMonitor = (
  desk: Spot,
): { x: number; y: number; w: number; h: number } => ({
  x: desk.x + 0.27,
  y: desk.y + 0.32,
  w: 0.46,
  h: 0.3,
})

/** A monitor seen from behind: its back, and the neck and foot towards the
 * one who works at it. */
function drawMonitorBack(
  ctx: Ctx,
  back: { x: number; y: number; w: number; h: number },
  pal: Palette,
): void {
  const centre = back.x + back.w / 2
  ctx.fillStyle = pal.bezel
  roundRect(ctx, centre - 0.12, back.y - 0.1, 0.24, 0.05, 0.02)
  ctx.fillRect(centre - 0.04, back.y - 0.07, 0.08, 0.08)
  roundRect(ctx, back.x, back.y, back.w, back.h, MONITOR_RADIUS)
}

function drawCubicle(ctx: Ctx, desk: Spot, seat: Spot, pal: Palette): void {
  drawChair(ctx, { x: seat.x + 0.5, y: seat.y + 0.55 }, -1, pal)
  drawBlock(
    ctx,
    { x: desk.x + DESK_LEFT, y: desk.y + 0.1 },
    { w: DESK_WIDTH, h: 0.72 },
    pal,
  )
  drawKeyboard(ctx, { x: desk.x + 0.3, y: desk.y + 0.12 }, 0.4, pal)
  ctx.fillStyle = pal.bezel
  circle(ctx, { x: desk.x + 0.82, y: desk.y + 0.16 }, 0.04)
  drawMonitorBack(ctx, deskMonitor(desk), pal)
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
  drawChair(ctx, floor.chair, 1, pal)
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

/** An office plant in its pot, seen from above. */
function drawPlant(ctx: Ctx, centre: Spot, pal: Palette): void {
  ctx.fillStyle = 'rgb(0 0 0 / 15%)'
  ctx.beginPath()
  ctx.ellipse(centre.x, centre.y + 0.3, 0.26, 0.08, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = pal.edge
  roundRect(ctx, centre.x - 0.17, centre.y + 0.02, 0.34, 0.28, 0.06)
  outline(ctx)
  ctx.fillStyle = pal.furniture
  roundRect(ctx, centre.x - 0.2, centre.y - 0.02, 0.4, 0.08, 0.03)
  ctx.fillStyle = pal.leafShade
  for (const [dx, dy, r] of LEAVES)
    circle(ctx, { x: centre.x + dx, y: centre.y + dy }, r)
  ctx.fillStyle = pal.leaf
  for (const [dx, dy, r] of LEAVES)
    circle(ctx, { x: centre.x + dx - 0.03, y: centre.y + dy - 0.03 }, r * 0.7)
}

// Each leaf cluster's offset from the pot's centre and its radius.
const LEAVES: readonly (readonly [number, number, number])[] = [
  [-0.14, -0.12, 0.15],
  [0.14, -0.12, 0.15],
  [0, -0.26, 0.16],
  [0, -0.06, 0.14],
]

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
  for (const plant of floor.plants)
    drawPlant(ctx, { x: plant.x + 0.5, y: plant.y + 0.5 }, pal)
}

function screenColour(employee: Employee, pal: Palette): string {
  if (employee.spirit === 'grey') return pal.screen
  return pal.rebel[employee.id % pal.rebel.length] ?? pal.screen
}

function drawScreenMark(
  ctx: Ctx,
  back: { x: number; y: number; w: number; h: number },
  pal: Palette,
  progress: number,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(back.x, back.y, back.w, back.h, MONITOR_RADIUS)
  ctx.clip()
  drawMark(
    ctx,
    { x: back.x + back.w / 2, y: back.y + back.h / 2 },
    back.w * SCREEN_MARK_COVER,
    pal,
    progress,
  )
  ctx.restore()
}

/** How far the file on an employee's desk has been read (0 to 1), or null
 * when there is none: worked through in boss mode, helped with by the player
 * in rebel mode, and unread while it waits (R-GAME-18). */
export function fileRead(state: DayState, employee: Employee): number | null {
  const { busy } = state.player
  if (employee.file) {
    if (busy?.kind !== 'help' || busy.target !== employee.id) return 0
    return readSoFar(state.clock, busy.until, state.tuning['rebel.helpSeconds'])
  }
  if (state.mode === 'boss' && employee.workingUntil > state.clock)
    return readSoFar(
      state.clock,
      employee.workingUntil,
      state.tuning.fileWorkSeconds,
    )
  return null
}

const readSoFar = (clock: number, until: number, length: number): number =>
  Math.min(1, Math.max(0, 1 - (until - clock) / length))

/** Each employee's screen, seen from behind, lights up in their colour, a
 * tempted one's carrying the Rebel Match mark on its back so the state reads
 * by shape as well as colour, its intro playing out over the grace time as
 * they turn, beside the file they were handed (R-GAME-18). */
export function drawScreens(ctx: Ctx, state: DayState, pal: Palette): void {
  const grace = state.tuning[`${state.floor}.temptedGraceSeconds`]
  floors[state.floor].cubicles.forEach(({ desk }, index) => {
    const employee = state.employees.find((e) => e.cubicle === index)
    if (employee === undefined) return
    const back = deskMonitor(desk)
    ctx.fillStyle = screenColour(employee, pal)
    roundRect(
      ctx,
      back.x - GLOW,
      back.y - GLOW,
      back.w + 2 * GLOW,
      back.h + 2 * GLOW,
      0.08,
    )
    drawMonitorBack(ctx, back, pal)
    if (employee.spirit === 'tempted')
      drawScreenMark(ctx, back, pal, (state.clock - employee.temptedAt) / grace)
    const read = fileRead(state, employee)
    if (read !== null)
      drawFile(
        ctx,
        { x: desk.x + FILE_SPOT.x, y: desk.y + FILE_SPOT.y },
        pal,
        read,
      )
  })
}

// A hinged door: the arc it swings through, faint on the floor, then its leaf
// with a hinge and a handle.
function drawSwing(
  ctx: Ctx,
  swing: Swing,
  openness: number,
  pal: Palette,
): void {
  const { hinge, length, shut, open } = swing
  ctx.strokeStyle = 'rgb(0 0 0 / 12%)'
  ctx.lineWidth = 0.03
  ctx.beginPath()
  ctx.arc(hinge.x, hinge.y, length, shut, open)
  ctx.stroke()
  const [from, to] = leafAt(swing, openness)
  ctx.lineCap = 'round'
  for (const [colour, width] of [
    [pal.edge, 2 * LEAF_HALF + 0.04],
    [pal.furniture, 2 * LEAF_HALF],
  ] as const) {
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }
  ctx.fillStyle = pal.wall
  circle(ctx, from, LEAF_HALF + 0.03)
  ctx.fillStyle = pal.bezel
  circle(
    ctx,
    { x: from.x + (to.x - from.x) * 0.85, y: from.y + (to.y - from.y) * 0.85 },
    0.04,
  )
}

/** The office door (R-GAME-21). */
export function drawDoor(ctx: Ctx, state: DayState, pal: Palette): void {
  drawSwing(ctx, floors[state.floor].officeDoor, state.door.openness, pal)
}

/** How far into the wall pocket the meeting room's door slides to open. */
const POCKET = 0.85

/** The meeting room's sliding door, in its doorway in the wall: shut, with a
 * handle, or slid into the wall but for its edge during a meeting
 * (R-GAME-6). */
export function drawMeetingDoor(ctx: Ctx, state: DayState, pal: Palette): void {
  const door = floors[state.floor].meetingDoor
  const leaf = {
    x: door.x + (1 - WALL) / 2 + 0.04,
    y: door.y + (meetingDoorOpen(state) ? POCKET : 0),
    w: WALL - 0.08,
    h: 1,
  }
  ctx.fillStyle = pal.furniture
  ctx.fillRect(leaf.x, leaf.y, leaf.w, leaf.h)
  ctx.strokeStyle = pal.edge
  ctx.lineWidth = 0.03
  ctx.strokeRect(leaf.x, leaf.y, leaf.w, leaf.h)
  ctx.fillStyle = pal.bezel
  circle(ctx, { x: leaf.x + leaf.w / 2, y: leaf.y + 0.15 }, 0.04)
}
