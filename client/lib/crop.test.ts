import { describe, expect, it } from 'vitest'
import { cropOf, framingOf, panned, zoomed } from './crop'

const landscape = { width: 4000, height: 3000 }
const portrait = { width: 3000, height: 4000 }

describe('the photo crop (R-PROF-5)', () => {
  it('opens on the largest centred square', () => {
    expect(cropOf(landscape, framingOf(landscape))).toEqual({
      x: 500,
      y: 0,
      side: 3000,
    })
    expect(cropOf(portrait, framingOf(portrait))).toEqual({
      x: 0,
      y: 500,
      side: 3000,
    })
  })

  it('follows the finger, scaled from the frame to the picture', () => {
    const moved = panned(landscape, framingOf(landscape), {
      dx: 50,
      dy: 0,
      framePx: 300,
    })
    expect(cropOf(landscape, moved)).toEqual({ x: 0, y: 0, side: 3000 })
  })

  it('stops at the edge of the picture however far the finger goes', () => {
    const far = panned(landscape, framingOf(landscape), {
      dx: -5000,
      dy: -5000,
      framePx: 300,
    })
    expect(cropOf(landscape, far)).toEqual({ x: 1000, y: 0, side: 3000 })
    const back = panned(landscape, far, { dx: 10, dy: 0, framePx: 300 })
    expect(cropOf(landscape, back).x).toBe(900)
  })

  it('zooms in on the same middle', () => {
    const closer = zoomed(landscape, framingOf(landscape), 2, 4)
    expect(cropOf(landscape, closer)).toEqual({ x: 1250, y: 750, side: 1500 })
  })

  it('keeps the zoom between the whole square and the most allowed', () => {
    const framing = framingOf(landscape)
    expect(zoomed(landscape, framing, 0.2, 4).zoom).toBe(1)
    expect(zoomed(landscape, framing, 9, 4).zoom).toBe(4)
  })

  it('pulls the frame back inside when zooming out near an edge', () => {
    const corner = panned(
      landscape,
      zoomed(landscape, framingOf(landscape), 3, 4),
      {
        dx: 5000,
        dy: 5000,
        framePx: 300,
      },
    )
    const out = zoomed(landscape, corner, 1, 4)
    expect(cropOf(landscape, out)).toEqual({ x: 0, y: 0, side: 3000 })
  })
})
