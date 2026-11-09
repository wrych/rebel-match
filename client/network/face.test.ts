// @vitest-environment jsdom
import { Color } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { faceShown, photoBall, roundFace } from './face'

function decoding(result: Promise<void>): void {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    value: () => result,
    configurable: true,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
})

describe('the viewer’s face in the replay (R-NET-2, R-PROF-7)', () => {
  it('shows only once the viewer’s own point has joined', () => {
    expect(faceShown(3, 3)).toBe(false)
    expect(faceShown(4, 3)).toBe(true)
  })

  it('never shows for a viewer with no point', () => {
    expect(faceShown(10, -1)).toBe(false)
  })

  it('draws the picture clipped round and ringed in the accent colour', () => {
    const calls: string[] = []
    const context = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      beginPath: () => undefined,
      arc: () => undefined,
      clip: () => calls.push('clip'),
      drawImage: () => calls.push('draw'),
      stroke: () => calls.push('stroke'),
      lineWidth: 0,
      strokeStyle: '',
    }
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    )

    roundFace(document.createElement('canvas'), '#d4471f', canvas)

    expect(calls).toEqual(['save', 'clip', 'draw', 'restore', 'stroke'])
    expect(context.strokeStyle).toBe('#d4471f')
    expect(canvas.width).toBe(canvas.height)
  })

  it('sits at the viewer’s point, hidden and empty until its photo loads', () => {
    decoding(new Promise(() => undefined))
    const ball = photoBall(
      { x: 1, y: 2, z: 3 },
      '/me.jpg',
      new Color('#d4471f'),
    )

    expect(ball.position.toArray()).toEqual([1, 2, 3])
    expect(ball.visible).toBe(false)
    expect(ball.material.opacity).toBe(0)
    expect(ball.material.depthTest).toBe(false)
  })

  it('takes the round photo as its picture once it has loaded', async () => {
    decoding(Promise.resolve())
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const ball = photoBall({ x: 0, y: 0, z: 0 }, '/me.jpg', new Color('#fff'))

    await vi.waitFor(() => {
      expect(ball.material.map).not.toBeNull()
    })
    expect(ball.material.opacity).toBe(1)
  })
})
