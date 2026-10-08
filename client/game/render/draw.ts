import { floors, TILE, type Floor, type Spot } from '../core/floors'
import { HEAT, type DayState, type Employee } from '../core/state'
import { greyOf, lookOf, type Look, type Palette } from './palette'
import { markers, type View } from './view'

type Ctx = CanvasRenderingContext2D

const TAU = Math.PI * 2
const BODY = 0.34
const HEAD = 0.17

function tileColour(tile: string, pal: Palette): string | null {
  if (tile === TILE.wall) return pal.wall
  if (tile === TILE.office) return pal.office
  if (tile === TILE.meeting || tile === TILE.table) return pal.meeting
  return pal.floor
}

function drawTiles(ctx: Ctx, floor: Floor, view: View, pal: Palette): void {
  const top = Math.max(0, Math.floor(view.y))
  const left = Math.max(0, Math.floor(view.x))
  const bottom = Math.min(floor.height, Math.ceil(view.y + view.height) + 1)
  const right = Math.min(floor.width, Math.ceil(view.x + view.width) + 1)
  for (let y = top; y < bottom; y += 1) {
    const row = floor.rows[y] ?? ''
    for (let x = left; x < right; x += 1) {
      ctx.fillStyle = tileColour(row[x] ?? TILE.wall, pal) ?? pal.floor
      ctx.fillRect(x, y, 1.02, 1.02)
    }
  }
}

function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

function drawFurniture(ctx: Ctx, floor: Floor, pal: Palette): void {
  ctx.fillStyle = pal.furniture
  for (const { desk } of floor.cubicles)
    roundRect(ctx, desk.x + 0.05, desk.y + 0.15, 0.9, 0.7, 0.1)
  roundRect(ctx, floor.cabinet.x + 0.15, floor.cabinet.y + 0.1, 0.7, 0.8, 0.08)
  roundRect(ctx, floor.table.x - 0.3, floor.table.y + 0.05, 1.6, 0.9, 0.2)
  for (const { cooler } of floor.coolers) {
    ctx.fillStyle = pal.furniture
    roundRect(ctx, cooler.x + 0.2, cooler.y + 0.35, 0.6, 0.6, 0.1)
    ctx.fillStyle = pal.paper
    roundRect(ctx, cooler.x + 0.3, cooler.y + 0.05, 0.4, 0.4, 0.15)
  }
}

function screenColour(employee: Employee, pal: Palette): string {
  if (employee.spirit === 'grey') return pal.screen
  return pal.rebel[employee.id % pal.rebel.length] ?? pal.screen
}

// A tempted employee's screen carries the CR logo, so the state reads by shape
// as well as colour (R-GAME-18).
function drawScreen(
  ctx: Ctx,
  desk: Spot,
  colour: string,
  logo: boolean,
  pal: Palette,
): void {
  ctx.fillStyle = colour
  roundRect(ctx, desk.x + 0.25, desk.y + 0.22, 0.5, 0.34, 0.05)
  if (!logo) return
  drawLabel(ctx, 'CR', { x: desk.x + 0.5, y: desk.y + 0.39 }, LOGO_SIZE, pal)
}

const LOGO_SIZE = 0.2

// Text is set in screen pixels: some browsers, Firefox among them, place a
// font of a fraction of a pixel wrongly once the canvas is scaled.
function drawLabel(
  ctx: Ctx,
  text: string,
  at: Spot,
  size: number,
  pal: Palette,
): void {
  const m = ctx.getTransform()
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = pal.paper
  ctx.font = `bold ${String(Math.max(1, Math.round(size * m.a)))}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    text,
    m.a * at.x + m.c * at.y + m.e,
    m.b * at.x + m.d * at.y + m.f,
  )
  ctx.restore()
}

function drawFile(ctx: Ctx, at: Spot, pal: Palette): void {
  ctx.fillStyle = pal.paper
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = 0.03
  ctx.fillRect(at.x, at.y, 0.26, 0.32)
  ctx.strokeRect(at.x, at.y, 0.26, 0.32)
}

function drawDesks(ctx: Ctx, state: DayState, pal: Palette): void {
  const floor = floors[state.floor]
  floor.cubicles.forEach((cubicle, index) => {
    const employee = state.employees.find((e) => e.cubicle === index)
    if (employee === undefined) return
    const colour = screenColour(employee, pal)
    drawScreen(ctx, cubicle.desk, colour, employee.spirit === 'tempted', pal)
    if (employee.file)
      drawFile(ctx, { x: cubicle.desk.x + 0.68, y: cubicle.desk.y + 0.2 }, pal)
  })
}

interface Figure {
  look: Look
  grey: boolean
  rebel: boolean
  slumped: boolean
  heat: number
  carrying: boolean
  boss: boolean
}

function drawBody(
  ctx: Ctx,
  at: Spot,
  figure: Figure,
  paint: (c: string) => string,
): void {
  const drop = figure.slumped ? 0.08 : 0
  ctx.fillStyle = 'rgb(0 0 0 / 18%)'
  ctx.beginPath()
  ctx.ellipse(at.x, at.y + 0.32, 0.3, 0.1, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = paint(figure.look.suit)
  roundRect(ctx, at.x - BODY / 1.1, at.y - 0.05 + drop, BODY * 1.8, 0.38, 0.14)
  ctx.fillStyle = paint(figure.boss ? '#b8262d' : '#2a2a2a')
  ctx.fillRect(at.x - 0.03, at.y + drop, 0.06, 0.2)
}

function drawHead(
  ctx: Ctx,
  at: Spot,
  figure: Figure,
  paint: (c: string) => string,
  pal: Palette,
): void {
  const y = at.y - 0.18 + (figure.slumped ? 0.12 : 0)
  ctx.fillStyle = paint(figure.look.skin)
  ctx.beginPath()
  ctx.arc(at.x, y, HEAD, 0, TAU)
  ctx.fill()
  const hair = figure.rebel
    ? (pal.rebel[figure.look.rebelHair % pal.rebel.length] ?? figure.look.hair)
    : figure.look.hair
  ctx.fillStyle = paint(hair)
  ctx.beginPath()
  ctx.arc(at.x, y - 0.04, HEAD, Math.PI, TAU)
  ctx.fill()
  if (figure.rebel) {
    ctx.beginPath()
    ctx.arc(at.x + 0.08, y - 0.2, 0.08, 0, TAU)
    ctx.fill()
  }
}

function drawFist(
  ctx: Ctx,
  at: Spot,
  figure: Figure,
  paint: (c: string) => string,
): void {
  if (!figure.rebel || figure.slumped) return
  ctx.fillStyle = paint(figure.look.skin)
  ctx.beginPath()
  ctx.arc(at.x + 0.3, at.y - 0.3, 0.07, 0, TAU)
  ctx.fill()
  ctx.fillStyle = paint(figure.look.suit)
  ctx.fillRect(at.x + 0.26, at.y - 0.25, 0.08, 0.26)
}

// Heat shows as a flush, then sweat, then steam, over a heat bar (R-GAME-18).
function drawHeat(ctx: Ctx, at: Spot, heat: number, pal: Palette): void {
  if (heat <= HEAT.cool) return
  ctx.fillStyle = pal.heat[heat - 1] ?? pal.ink
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.arc(at.x - 0.08, at.y - 0.14, 0.05, 0, TAU)
  ctx.arc(at.x + 0.08, at.y - 0.14, 0.05, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  for (let stage = 0; stage < HEAT.boiling; stage += 1) {
    ctx.fillStyle = stage < heat ? (pal.heat[stage] ?? pal.ink) : pal.screen
    ctx.fillRect(at.x - 0.24 + stage * 0.17, at.y - 0.55, 0.14, 0.06)
  }
  if (heat >= HEAT.hot) drawDrops(ctx, at, heat, pal)
}

function drawDrops(ctx: Ctx, at: Spot, heat: number, pal: Palette): void {
  ctx.fillStyle = heat >= HEAT.boiling ? pal.paper : '#7fc4ff'
  for (const dx of [-0.2, 0.22]) {
    ctx.beginPath()
    ctx.arc(at.x + dx, at.y - 0.38, 0.045, 0, TAU)
    ctx.fill()
  }
}

/** Draws a person: grey drains the whole figure, never just the skin. */
export function drawFigure(
  ctx: Ctx,
  at: Spot,
  figure: Figure,
  pal: Palette,
): void {
  const paint = (colour: string): string =>
    figure.grey ? greyOf(colour) : colour
  drawBody(ctx, at, figure, paint)
  drawFist(ctx, at, figure, paint)
  drawHead(ctx, at, figure, paint, pal)
  drawHeat(ctx, at, figure.heat, pal)
  if (figure.carrying) drawFile(ctx, { x: at.x + 0.18, y: at.y - 0.02 }, pal)
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
  drawFurniture(ctx, floor, pal)
  drawDesks(ctx, state, pal)
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
