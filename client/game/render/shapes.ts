import type { Spot } from '../core/floors'
import type { Palette } from './palette'

export type Ctx = CanvasRenderingContext2D

export const TAU = Math.PI * 2

/** The soft line round people and things, so they stand off the floor. */
const OUTLINE = 'rgb(0 0 0 / 35%)'
const OUTLINE_WIDTH = 0.025

export function roundRect(
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

/** Strokes the path just filled with the outline. */
export function outline(ctx: Ctx): void {
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = OUTLINE_WIDTH
  ctx.stroke()
}

export function circle(ctx: Ctx, at: Spot, r: number): void {
  ctx.beginPath()
  ctx.arc(at.x, at.y, r, 0, TAU)
  ctx.fill()
}

// Text is set in screen pixels: some browsers, Firefox among them, place a
// font of a fraction of a pixel wrongly once the canvas is scaled.
export function drawLabel(
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

export const FILE = { width: 0.26, height: 0.32 }

/** A file: a sheet with lines of text and a folded corner. */
export function drawFile(ctx: Ctx, at: Spot, pal: Palette): void {
  ctx.fillStyle = pal.paper
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = 0.03
  ctx.fillRect(at.x, at.y, FILE.width, FILE.height)
  ctx.strokeRect(at.x, at.y, FILE.width, FILE.height)
  ctx.fillStyle = pal.screen
  for (const line of [0.08, 0.15, 0.22])
    ctx.fillRect(at.x + 0.05, at.y + line, FILE.width - 0.1, 0.025)
}
