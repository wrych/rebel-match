import { CanvasTexture, type Color, Sprite, SpriteMaterial } from 'three'
import type { Point } from './layout'

const tuning = {
  texturePx: 256,
  ringShare: 0.06,
  diameter: 11,
  renderOrder: 10,
}

/** Whether the viewer's face shows once `shown` points have joined: only
 * after their own point at `selfIndex` has, and never without one. */
export const faceShown = (shown: number, selfIndex: number): boolean =>
  selfIndex >= 0 && shown > selfIndex

/** Draws `picture` round, ringed in `ring`, filling a square canvas. */
export function roundFace(
  picture: CanvasImageSource,
  ring: string,
  canvas: HTMLCanvasElement,
): void {
  const px = tuning.texturePx
  canvas.width = px
  canvas.height = px
  const context = canvas.getContext('2d')
  if (context === null) return
  const middle = px / 2
  const ringPx = px * tuning.ringShare
  context.save()
  context.beginPath()
  context.arc(middle, middle, middle - ringPx / 2, 0, Math.PI * 2)
  context.clip()
  context.drawImage(picture, 0, 0, px, px)
  context.restore()
  context.lineWidth = ringPx
  context.strokeStyle = ring
  context.beginPath()
  context.arc(middle, middle, middle - ringPx / 2, 0, Math.PI * 2)
  context.stroke()
}

/** The viewer's own point drawn as their photo, always facing the camera
 * and never hidden behind another point (R-NET-2, R-PROF-7). Empty until
 * the photo has loaded; a photo that fails leaves the plain point. */
export function photoBall(at: Point, src: string, ring: Color): Sprite {
  const material = new SpriteMaterial({
    transparent: true,
    depthTest: false,
    opacity: 0,
  })
  const ball = new Sprite(material)
  ball.position.set(at.x, at.y, at.z)
  ball.scale.set(tuning.diameter, tuning.diameter, 1)
  ball.renderOrder = tuning.renderOrder
  ball.visible = false
  const picture = new Image()
  picture.src = src
  void picture
    .decode()
    .then(() => {
      const canvas = document.createElement('canvas')
      roundFace(picture, `#${ring.getHexString()}`, canvas)
      material.map = new CanvasTexture(canvas)
      material.opacity = 1
      material.needsUpdate = true
    })
    .catch(() => undefined)
  return ball
}
