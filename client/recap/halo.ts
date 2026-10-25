import type { NetworkTimeline } from '../lib/network'
import type { Point } from '../network/layout'

/** A dot of the view, in the frame's own pixels, with how much of it is
 * left: 1 vivid, towards 0 faded to nothing. */
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

/** How the view is framed, in the frame's pixels: where the member's dot
 * sits, the point the network's centre lies towards, and how far past that
 * point it lands, which spreads the dots apart. */
export interface HaloFrame {
  self: { x: number; y: number }
  toward: { x: number; y: number }
  stretch: number
}

/** How the view fades: everything is gone at `reach` times the distance
 * from the member to the network's centre; below 1, `falloff` keeps the
 * fade gentle, so much of the network still shows. */
export const haloTuning = {
  reach: 2.2,
  falloff: 0.8,
}

type Vector = { x: number; y: number; z: number }

const minus = (a: Vector, b: Vector): Vector => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
})
const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y + a.z * b.z
const length = (a: Vector): number => Math.sqrt(dot(a, a))
const scaled = (a: Vector, by: number): Vector => ({
  x: a.x * by,
  y: a.y * by,
  z: a.z * by,
})
const cross = (a: Vector, b: Vector): Vector => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

function centreOf(points: readonly Point[]): Vector {
  const sum = points.reduce(
    (total, point) => ({
      x: total.x + point.x,
      y: total.y + point.y,
      z: total.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  )
  return scaled(sum, 1 / Math.max(points.length, 1))
}

// The axis from the member to the network's centre, and a direction across
// it turned by `angle`: the view spins about that axis, so the member and
// the centre stay where the frame puts them.
function axesOf(
  self: Vector,
  centre: Vector,
  angle: number,
): { along: Vector; across: Vector; span: number } {
  const toCentre = minus(centre, self)
  const span = length(toCentre)
  const along = span > 0 ? scaled(toCentre, 1 / span) : { x: 1, y: 0, z: 0 }
  const helper =
    Math.abs(along.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  const first = minus(helper, scaled(along, dot(helper, along)))
  const up = scaled(first, 1 / length(first))
  const side = cross(along, up)
  return {
    along,
    across: {
      x: up.x * Math.cos(angle) + side.x * Math.sin(angle),
      y: up.y * Math.cos(angle) + side.y * Math.sin(angle),
      z: up.z * Math.cos(angle) + side.z * Math.sin(angle),
    },
    span,
  }
}

// Each point flattened onto the frame: along the axis towards `toward`,
// across it at right angles.
function flatten(
  points: readonly Point[],
  self: Vector,
  axes: ReturnType<typeof axesOf>,
  frame: HaloFrame,
  span: number,
): { x: number; y: number }[] {
  const dx = frame.toward.x - frame.self.x
  const dy = frame.toward.y - frame.self.y
  const onScreen = Math.hypot(dx, dy) || 1
  const d = { x: dx / onScreen, y: dy / onScreen }
  const scale = (onScreen * frame.stretch) / span
  return points.map((point) => {
    const offset = minus(point, self)
    const a = dot(offset, axes.along) * scale
    const b = dot(offset, axes.across) * scale
    return {
      x: frame.self.x + a * d.x - b * d.y,
      y: frame.self.y + a * d.y + b * d.x,
    }
  })
}

const fadeAt = (d: number, reach: number): number =>
  Math.max(1 - d / reach, 0) ** haloTuning.falloff

/** The member's surroundings, turned by `angle` about the line from their
 * dot to the network's centre and framed by `frame`: each dot and line
 * faded by its distance from them, the faintest first so the member's dot
 * is drawn last; null when the timeline marks nobody (R-RECAP-5). */
export function haloOf(
  timeline: NetworkTimeline,
  points: readonly Point[],
  angle: number,
  frame: HaloFrame,
): Halo | null {
  const selfIndex = timeline.nodes.findIndex((node) => node.self)
  const self = points[selfIndex]
  if (self === undefined) return null
  const axes = axesOf(self, centreOf(points), angle)
  const nearest = Math.min(
    ...points.map((p) => length(minus(p, self))).filter((d) => d > 0),
  )
  const span =
    axes.span > 0 ? axes.span : Number.isFinite(nearest) ? nearest : 1
  const reach = span * haloTuning.reach
  const fades = points.map((p) => fadeAt(length(minus(p, self)), reach))
  const flat = flatten(points, self, axes, frame, span)
  const dots = flat
    .map((at, index) => ({
      ...at,
      fade: fades[index] ?? 0,
      self: index === selfIndex,
    }))
    .filter((each) => each.fade > 0)
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
  /** How strongly the others show at their nearest, 0 to 1, so the view can
   * sit behind words; the member's own dot stays vivid. */
  strength: number
}

/** Sizes as shares of the frame's width. */
const look = {
  dot: 0.0075,
  selfDot: 0.014,
  glow: [0.045, 0.032, 0.022],
  glowAlpha: 0.1,
  line: 0.0018,
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

/** Draws the view on a frame `width` wide: lines and dots fading in colour
 * and opacity, the member's own dot vivid with a soft glow (R-RECAP-5). */
export function paintHalo(
  pen: HaloPen,
  halo: Halo,
  width: number,
  colours: HaloColours,
): void {
  const at = (p: { x: number; y: number }): [number, number] => [p.x, p.y]
  pen.lineWidth = Math.max(look.line * width, 1)
  for (const line of halo.lines) {
    pen.globalAlpha = line.fade * colours.strength
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
        pen.arc(x, y, radius * width, 0, Math.PI * 2)
        pen.fill()
      }
    } else pen.fillStyle = mix(colours.ink, colours.paper, 1 - dot.fade)
    pen.globalAlpha = dot.self ? 1 : dot.fade * colours.strength
    pen.beginPath()
    pen.arc(x, y, (dot.self ? look.selfDot : look.dot) * width, 0, Math.PI * 2)
    pen.fill()
  }
  pen.globalAlpha = 1
}
