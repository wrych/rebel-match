/** A square of the source picture, in its own pixels. */
export interface Crop {
  x: number
  y: number
  side: number
}

/** Where the member has framed their photo: how far in, and the source
 * point at the centre of the frame (R-PROF-5). */
export interface Framing {
  zoom: number
  centreX: number
  centreY: number
}

/** A picture's size in its own pixels. */
export interface Size {
  width: number
  height: number
}

const within = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high)

const sideAt = (size: Size, zoom: number): number =>
  Math.min(size.width, size.height) / zoom

function settled(size: Size, framing: Framing): Framing {
  const half = sideAt(size, framing.zoom) / 2
  return {
    zoom: framing.zoom,
    centreX: within(framing.centreX, half, size.width - half),
    centreY: within(framing.centreY, half, size.height - half),
  }
}

/** The framing a picture opens with: its largest square, centred. */
export function framingOf(size: Size): Framing {
  return { zoom: 1, centreX: size.width / 2, centreY: size.height / 2 }
}

/** The square a framing cuts from the picture, always inside it. */
export function cropOf(size: Size, framing: Framing): Crop {
  const side = sideAt(size, framing.zoom)
  const { centreX, centreY } = settled(size, framing)
  return { x: centreX - side / 2, y: centreY - side / 2, side }
}

/** The framing after a finger moved `dx`, `dy` across a frame `framePx`
 * wide: the picture follows the finger and stops at its edges. */
export function panned(
  size: Size,
  framing: Framing,
  move: { dx: number; dy: number; framePx: number },
): Framing {
  const scale = sideAt(size, framing.zoom) / move.framePx
  return settled(size, {
    zoom: framing.zoom,
    centreX: framing.centreX - move.dx * scale,
    centreY: framing.centreY - move.dy * scale,
  })
}

/** The framing at `zoom`, kept between the whole square and `maxZoom`, the
 * same point in the middle. */
export function zoomed(
  size: Size,
  framing: Framing,
  zoom: number,
  maxZoom: number,
): Framing {
  return settled(size, { ...framing, zoom: within(zoom, 1, maxZoom) })
}
