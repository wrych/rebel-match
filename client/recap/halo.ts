import type { NetworkTimeline } from '../lib/network'
import type { Point } from '../network/layout'

/** A dot of the view, on a square from -1 to 1 centred on the member, with
 * how much of it is left: 1 vivid, towards 0 faded to nothing. */
export interface HaloDot {
  x: number
  y: number
  fade: number
  self: boolean
}

export interface HaloLine {
  from: { x: number; y: number }
  to: { x: number; y: number }
  fade: number
}

/** The network around the member's own dot, flat (R-RECAP-5). */
export interface Halo {
  dots: HaloDot[]
  lines: HaloLine[]
}

/** How the view reaches and fades: the distance to the `nearest`-th nearest
 * dot, `stretch` times, is where everything is gone; `falloff` bends the
 * fade so the nearest stay bright. */
export const haloTuning = {
  nearest: 24,
  stretch: 1.4,
  falloff: 1.25,
  tilt: 0.35,
}

type Flat = { x: number; y: number; z: number }

// Turned about the vertical by `angle`, tipped towards the viewer by the
// tilt, around the member.
function turned(point: Point, centre: Point, angle: number): Flat {
  const x = point.x - centre.x
  const y = point.y - centre.y
  const z = point.z - centre.z
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const rx = x * cos + z * sin
  const rz = -x * sin + z * cos
  const tilt = haloTuning.tilt
  return {
    x: rx,
    y: y * Math.cos(tilt) - rz * Math.sin(tilt),
    z: y * Math.sin(tilt) + rz * Math.cos(tilt),
  }
}

const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

// Where all is faded: a little past the member's nearest few, so the view
// suits a network of any size and spread.
function reachOf(points: readonly Point[], centre: Point): number {
  const near = points
    .map((point) => distance(point, centre))
    .filter((d) => d > 0)
    .sort((a, b) => a - b)
  const edge = near[Math.min(haloTuning.nearest, near.length) - 1] ?? 1
  return edge * haloTuning.stretch
}

const fadeAt = (d: number, reach: number): number =>
  Math.max(1 - d / reach, 0) ** haloTuning.falloff

/** The member's surroundings at `angle`: every dot and line within reach,
 * faded by its distance from them, the faintest first so the member's dot
 * is drawn last; null when the timeline marks nobody (R-RECAP-5). */
export function haloOf(
  timeline: NetworkTimeline,
  points: readonly Point[],
  angle: number,
): Halo | null {
  const selfIndex = timeline.nodes.findIndex((node) => node.self)
  const centre = points[selfIndex]
  if (centre === undefined) return null
  const reach = reachOf(points, centre)
  const fades = points.map((point) => fadeAt(distance(point, centre), reach))
  const flat = points.map((point) => {
    const at = turned(point, centre, angle)
    return { x: at.x / reach, y: -at.y / reach }
  })
  const dots = flat
    .map((at, index) => ({
      ...at,
      fade: fades[index] ?? 0,
      self: index === selfIndex,
    }))
    .filter((dot) => dot.fade > 0)
    .sort((a, b) => Number(a.self) - Number(b.self) || a.fade - b.fade)
  const lines = timeline.links.flatMap((link) => {
    const fade = Math.min(fades[link.source] ?? 0, fades[link.target] ?? 0)
    const from = flat[link.source]
    const to = flat[link.target]
    return fade > 0 && from !== undefined && to !== undefined
      ? [{ from, to, fade }]
      : []
  })
  return { dots, lines }
}

/** The calls the view is drawn with: a canvas's 2D context, or a test's
 * stand-in. */
export type HaloPen = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'globalAlpha'
  | 'beginPath'
  | 'arc'
  | 'fill'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
>

/** The colours the view fades between: the member's accent, the ink the
 * nearest dots start in, and the paper they fade into. */
export interface HaloColours {
  accent: string
  ink: string
  paper: string
}

/** Sizes as shares of the view's side. */
const look = {
  dot: 0.014,
  selfDot: 0.026,
  glow: [0.075, 0.052, 0.038],
  glowAlpha: 0.12,
  line: 0.003,
}

const HEX = /^#([0-9a-f]{6})$/i

// `from` moved towards `to` by `share`; a colour that is not plain hex is
// kept as it is, and only its opacity fades.
export function mix(from: string, to: string, share: number): string {
  const a = HEX.exec(from)?.[1]
  const b = HEX.exec(to)?.[1]
  if (a === undefined || b === undefined) return from
  const channel = (hex: string, at: number): number =>
    parseInt(hex.slice(at, at + 2), 16)
  const mixed = [0, 2, 4].map((at) =>
    Math.round(channel(a, at) + (channel(b, at) - channel(a, at)) * share)
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${mixed.join('')}`
}

/** Draws the view in the square at `box`: lines and dots fading in colour
 * and opacity, the member's own dot vivid with a soft glow (R-RECAP-5). */
export function paintHalo(
  pen: HaloPen,
  halo: Halo,
  box: { x: number; y: number; size: number },
  colours: HaloColours,
): void {
  const half = box.size / 2
  const at = (p: { x: number; y: number }): [number, number] => [
    box.x + half + p.x * half,
    box.y + half + p.y * half,
  ]
  pen.lineWidth = Math.max(look.line * box.size, 1)
  for (const line of halo.lines) {
    pen.globalAlpha = line.fade
    pen.strokeStyle = mix(colours.ink, colours.paper, 1 - line.fade)
    pen.beginPath()
    pen.moveTo(...at(line.from))
    pen.lineTo(...at(line.to))
    pen.stroke()
  }
  for (const dot of halo.dots) {
    const [x, y] = at(dot)
    if (dot.self) {
      pen.fillStyle = colours.accent
      for (const radius of look.glow) {
        pen.globalAlpha = look.glowAlpha
        pen.beginPath()
        pen.arc(x, y, radius * box.size, 0, Math.PI * 2)
        pen.fill()
      }
    } else pen.fillStyle = mix(colours.ink, colours.paper, 1 - dot.fade)
    pen.globalAlpha = dot.self ? 1 : dot.fade
    pen.beginPath()
    pen.arc(
      x,
      y,
      (dot.self ? look.selfDot : look.dot) * box.size,
      0,
      Math.PI * 2,
    )
    pen.fill()
  }
  pen.globalAlpha = 1
}
