import type { Spot } from '../core/floors'
import {
  MARK_BAND_HEIGHT,
  MARK_BAND_OVERLAP,
  MARK_BAND_TOP,
  MARK_HAPPY_BANDS,
  MARK_LID_DROP,
  MARK_PLACE,
  MARK_R,
  MARK_RADIUS,
  MARK_SHUT_EYE,
  MARK_SIZE,
  MARK_SQUINT_LID,
  MARK_WINK_LID,
  markPose,
} from '../../lib/mark'
import type { Palette } from './palette'
import { roundRect, type Ctx } from './shapes'

/** The closed eye's line: its width, and its height, which picks its band. */
const SHUT_WIDTH = 4
const SHUT_Y = 227

interface Paths {
  r: Path2D
  winkLid: Path2D
  squintLid: Path2D
  shutEye: Path2D
}

let paths: Paths | undefined

function pathsOnce(): Paths {
  paths ??= {
    r: new Path2D(MARK_R),
    winkLid: new Path2D(MARK_WINK_LID),
    squintLid: new Path2D(MARK_SQUINT_LID),
    shutEye: new Path2D(MARK_SHUT_EYE),
  }
  return paths
}

// Where each R is drawn with its centre-ward move `offset`, the right one
// mirrored.
function leftAt(offset: number): DOMMatrix2DInit {
  const { x, y, scale } = MARK_PLACE
  return { a: scale, d: scale, e: x + offset, f: y }
}

function rightAt(offset: number): DOMMatrix2DInit {
  const { x, y, scale } = MARK_PLACE
  return { a: -scale, d: scale, e: MARK_SIZE - x - offset, f: y }
}

function placed(path: Path2D, at: DOMMatrix2DInit): Path2D {
  const out = new Path2D()
  out.addPath(path, at)
  return out
}

function bandAt(y: number): string {
  const index = Math.floor((y - MARK_BAND_TOP) / MARK_BAND_HEIGHT)
  return MARK_HAPPY_BANDS[index] ?? MARK_HAPPY_BANDS[0]
}

// Even-odd over both Rs is their XOR: where they overlap, black.
function drawRs(ctx: Ctx, offset: number): void {
  const { r } = pathsOnce()
  const both = placed(r, leftAt(offset))
  both.addPath(r, rightAt(offset))
  ctx.save()
  ctx.clip(both, 'evenodd')
  MARK_HAPPY_BANDS.forEach((colour, index) => {
    ctx.fillStyle = colour
    ctx.fillRect(
      0,
      MARK_BAND_TOP + index * MARK_BAND_HEIGHT,
      MARK_SIZE,
      MARK_BAND_HEIGHT + MARK_BAND_OVERLAP,
    )
  })
  ctx.restore()
}

// A lid closes the eye in one R's counter. Clipped to the other R, it only
// darkens what the eye shows; the rest under it is black already.
function drawLid(
  ctx: Ctx,
  lid: Path2D,
  over: DOMMatrix2DInit,
  closed: number,
  pal: Palette,
): void {
  ctx.save()
  ctx.clip(placed(pathsOnce().r, over), 'evenodd')
  ctx.fillStyle = pal.ink
  ctx.translate(0, -MARK_LID_DROP * (1 - closed))
  ctx.fill(lid)
  ctx.restore()
}

/** The Rebel Match mark in its happy bands on a rounded black square, `size`
 * wide and centred on `at`, at `progress` through its intro: at rest at 0 and
 * 1 (R-LOOK-5). */
export function drawMark(
  ctx: Ctx,
  at: Spot,
  size: number,
  pal: Palette,
  progress = 0,
): void {
  const left = at.x - size / 2
  const top = at.y - size / 2
  ctx.fillStyle = pal.ink
  roundRect(ctx, left, top, size, size, size * MARK_RADIUS)
  ctx.save()
  ctx.translate(left, top)
  ctx.scale(size / MARK_SIZE, size / MARK_SIZE)
  const pose = markPose(progress)
  drawRs(ctx, pose.offset)
  if (pose.lid > 0) {
    const { winkLid, squintLid } = pathsOnce()
    drawLid(ctx, winkLid, leftAt(pose.offset), pose.lid, pal)
    drawLid(ctx, squintLid, rightAt(pose.offset), pose.lid, pal)
  }
  if (pose.shut) {
    ctx.strokeStyle = bandAt(SHUT_Y)
    ctx.lineWidth = SHUT_WIDTH
    ctx.lineCap = 'round'
    ctx.stroke(pathsOnce().shutEye)
  }
  ctx.restore()
}
