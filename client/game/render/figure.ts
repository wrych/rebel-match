import type { Spot } from '../core/floors'
import { HEAT } from '../core/state'
import { greyOf, type Look, type Palette } from './palette'
import { circle, drawFile, outline, roundRect, TAU, type Ctx } from './shapes'

const BODY = 0.31
const HEAD = 0.17
const SHIRT = '#f4f2ee'
const TIE = '#2a2a2a'
const BOSS_TIE = '#b8262d'

export interface Figure {
  look: Look
  grey: boolean
  rebel: boolean
  slumped: boolean
  heat: number
  carrying: boolean
  boss: boolean
}

type Paint = (colour: string) => string

interface Pose {
  at: Spot
  figure: Figure
  paint: Paint
  /** How far a slumped figure sinks. */
  drop: number
}

function drawShadow(ctx: Ctx, at: Spot): void {
  ctx.fillStyle = 'rgb(0 0 0 / 18%)'
  ctx.beginPath()
  ctx.ellipse(at.x, at.y + 0.33, 0.32, 0.1, 0, 0, TAU)
  ctx.fill()
}

// The arms hang at the sides; a rebel's right one is raised in a fist.
function drawArms(ctx: Ctx, { at, figure, paint, drop }: Pose): void {
  const raised = figure.rebel && !figure.slumped
  const sides = raised ? [-1] : [-1, 1]
  for (const side of sides) {
    ctx.fillStyle = paint(figure.look.suit)
    roundRect(ctx, at.x + side * BODY - 0.05, at.y + drop, 0.1, 0.26, 0.05)
    outline(ctx)
    ctx.fillStyle = paint(figure.look.skin)
    circle(ctx, { x: at.x + side * BODY, y: at.y + 0.27 + drop }, 0.05)
  }
  if (!raised) return
  ctx.fillStyle = paint(figure.look.suit)
  roundRect(ctx, at.x + 0.26, at.y - 0.26, 0.09, 0.3, 0.04)
  outline(ctx)
  ctx.fillStyle = paint(figure.look.skin)
  circle(ctx, { x: at.x + 0.3, y: at.y - 0.3 }, 0.07)
  outline(ctx)
}

function drawBody(ctx: Ctx, { at, figure, paint, drop }: Pose): void {
  const top = at.y - 0.05 + drop
  ctx.fillStyle = paint(figure.look.suit)
  roundRect(ctx, at.x - BODY, top, BODY * 2, 0.38, 0.14)
  outline(ctx)
  ctx.fillStyle = 'rgb(0 0 0 / 14%)'
  roundRect(ctx, at.x - BODY, top + 0.24, BODY * 2, 0.14, 0.1)
  ctx.fillStyle = paint(SHIRT)
  ctx.beginPath()
  ctx.moveTo(at.x - 0.09, top)
  ctx.lineTo(at.x + 0.09, top)
  ctx.lineTo(at.x, top + 0.13)
  ctx.fill()
  ctx.fillStyle = paint(figure.boss ? BOSS_TIE : TIE)
  circle(ctx, { x: at.x, y: top + 0.04 }, 0.03)
  ctx.beginPath()
  ctx.moveTo(at.x - 0.03, top + 0.05)
  ctx.lineTo(at.x + 0.03, top + 0.05)
  ctx.lineTo(at.x, top + 0.26)
  ctx.fill()
}

// Each style draws over the top of the head; the long one also falls behind
// it, so it is drawn before the face.
const hairStyles: readonly ((ctx: Ctx, head: Spot) => void)[] = [
  (ctx, head) => {
    ctx.beginPath()
    ctx.arc(head.x, head.y - 0.03, HEAD, Math.PI, TAU)
    ctx.fill()
  },
  (ctx, head) => {
    ctx.beginPath()
    ctx.arc(head.x, head.y - 0.03, HEAD, Math.PI, TAU)
    ctx.ellipse(head.x - 0.07, head.y - 0.06, 0.12, 0.06, -0.4, 0, TAU)
    ctx.fill()
  },
  (ctx, head) => {
    ctx.beginPath()
    ctx.arc(head.x, head.y - 0.04, HEAD, Math.PI, TAU)
    ctx.fill()
    circle(ctx, { x: head.x, y: head.y - 0.22 }, 0.08)
  },
  (ctx, head) => {
    ctx.beginPath()
    ctx.arc(
      head.x,
      head.y - 0.02,
      HEAD + 0.02,
      Math.PI * 0.9,
      TAU + 0.1 * Math.PI,
    )
    ctx.fill()
  },
]

const LONG = 3

function drawFace(ctx: Ctx, head: Spot, pose: Pose): void {
  const { figure, paint } = pose
  ctx.fillStyle = paint(figure.look.skin)
  circle(ctx, { x: head.x - HEAD, y: head.y + 0.02 }, 0.04)
  circle(ctx, { x: head.x + HEAD, y: head.y + 0.02 }, 0.04)
  circle(ctx, head, HEAD)
  outline(ctx)
  ctx.fillStyle = paint('#1c1b19')
  const eyes = figure.slumped ? 0.012 : 0.022
  circle(ctx, { x: head.x - 0.06, y: head.y + 0.03 }, eyes)
  circle(ctx, { x: head.x + 0.06, y: head.y + 0.03 }, eyes)
}

// A rebel wears a crest of spikes in their colour.
function drawCrest(ctx: Ctx, head: Spot): void {
  ctx.beginPath()
  for (const dx of [-0.08, 0, 0.08]) {
    ctx.moveTo(head.x + dx - 0.05, head.y - 0.12)
    ctx.lineTo(head.x + dx, head.y - 0.3)
    ctx.lineTo(head.x + dx + 0.05, head.y - 0.12)
  }
  ctx.fill()
}

function drawHead(ctx: Ctx, pose: Pose, pal: Palette): void {
  const { at, figure, paint } = pose
  const head = { x: at.x, y: at.y - 0.18 + (figure.slumped ? 0.12 : 0) }
  const hair = figure.rebel
    ? (pal.rebel[figure.look.rebelHair % pal.rebel.length] ?? figure.look.hair)
    : figure.look.hair
  const style = figure.look.hairStyle
  ctx.fillStyle = paint(hair)
  if (style === LONG)
    roundRect(
      ctx,
      head.x - HEAD - 0.02,
      head.y - 0.05,
      2 * HEAD + 0.04,
      0.26,
      0.08,
    )
  drawFace(ctx, head, pose)
  ctx.fillStyle = paint(hair)
  hairStyles[style]?.(ctx, head)
  if (figure.rebel) drawCrest(ctx, head)
}

// Heat shows as a flush, then sweat, then steam, over a heat bar (R-GAME-18).
function drawHeat(ctx: Ctx, at: Spot, heat: number, pal: Palette): void {
  if (heat <= HEAT.cool) return
  ctx.fillStyle = pal.heat[heat - 1] ?? pal.ink
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.arc(at.x - 0.08, at.y - 0.12, 0.05, 0, TAU)
  ctx.arc(at.x + 0.08, at.y - 0.12, 0.05, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  for (let stage = 0; stage < HEAT.boiling; stage += 1) {
    ctx.fillStyle = stage < heat ? (pal.heat[stage] ?? pal.ink) : pal.screen
    ctx.fillRect(at.x - 0.24 + stage * 0.17, at.y - 0.6, 0.14, 0.06)
  }
  if (heat >= HEAT.hot) drawDrops(ctx, at, heat, pal)
}

function drawDrops(ctx: Ctx, at: Spot, heat: number, pal: Palette): void {
  ctx.fillStyle = heat >= HEAT.boiling ? pal.paper : '#7fc4ff'
  for (const dx of [-0.22, 0.24])
    circle(ctx, { x: at.x + dx, y: at.y - 0.38 }, 0.045)
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
  const pose = { at, figure, paint, drop: figure.slumped ? 0.08 : 0 }
  drawShadow(ctx, at)
  drawArms(ctx, pose)
  drawBody(ctx, pose)
  drawHead(ctx, pose, pal)
  drawHeat(ctx, at, figure.heat, pal)
  if (figure.carrying) drawFile(ctx, { x: at.x + 0.2, y: at.y - 0.02 }, pal)
}
