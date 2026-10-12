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

export const FILE = { width: 0.26, height: 0.32 }

/** The lines of fake text on a file, as shares of the line's full width. */
const FILE_LINES = [0.9, 0.7, 0.85, 0.6, 0.9, 0.75, 0.5]
const FILE_MARGIN = { x: 0.035, top: 0.045, bottom: 0.035 }
/** How much of a line's pitch its ink takes. */
const FILE_INK = 0.55

/** A file: a sheet of lines of text, read from the top down, a line turning
 * green as far as `read` (0 to 1) has got (R-GAME-18). */
export function drawFile(ctx: Ctx, at: Spot, pal: Palette, read = 0): void {
  ctx.fillStyle = pal.paper
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = 0.03
  ctx.fillRect(at.x, at.y, FILE.width, FILE.height)
  ctx.strokeRect(at.x, at.y, FILE.width, FILE.height)
  const pitch =
    (FILE.height - FILE_MARGIN.top - FILE_MARGIN.bottom) / FILE_LINES.length
  const done = read * FILE_LINES.length
  FILE_LINES.forEach((share, index) => {
    const x = at.x + FILE_MARGIN.x
    const y = at.y + FILE_MARGIN.top + index * pitch
    const width = (FILE.width - 2 * FILE_MARGIN.x) * share
    ctx.fillStyle = pal.screen
    ctx.fillRect(x, y, width, pitch * FILE_INK)
    const through = Math.min(1, Math.max(0, done - index))
    if (through <= 0) return
    ctx.fillStyle = pal.fine
    ctx.fillRect(x, y, width * through, pitch * FILE_INK)
  })
}
