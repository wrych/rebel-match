import type { Crop } from './crop'
import { ensureOk, failure } from './request'

/** How the browser shapes a photo before it travels (R-PROF-5). */
export interface PhotoShape {
  photoSidePx: number
  photoJpegQuality: number
}

/** The chosen picture, decoded on the device, upright as it was taken;
 * throws when the browser cannot read it. */
export function readPicture(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

/** The square the member framed, scaled down to `photoSidePx` as a JPEG, so
 * the original never leaves the device (ADR 0066). */
export function encodeSquare(
  picture: CanvasImageSource,
  crop: Crop,
  shape: PhotoShape,
): Promise<Blob> {
  const side = Math.round(Math.min(crop.side, shape.photoSidePx))
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (context === null) return Promise.reject(new Error('no canvas'))
  context.drawImage(
    picture,
    crop.x,
    crop.y,
    crop.side,
    crop.side,
    0,
    0,
    side,
    side,
  )
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new Error('photo not encoded'))
        else resolve(blob)
      },
      'image/jpeg',
      shape.photoJpegQuality,
    )
  })
}

/** Where the member's own photo is read, a new address each time it is set,
 * so no cached picture outlives a change. */
export const ownPhotoUrl = (photoAt: string): string =>
  `/api/profile/photo?v=${encodeURIComponent(photoAt)}`

/** Saves the photo; `refused` when the server would not take it, a throw for
 * anything else, so a failure is never shown as saved (R-PROF-5). */
export async function savePhoto(jpeg: Blob): Promise<'saved' | 'refused'> {
  const response = await fetch('/api/profile/photo', {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: jpeg,
  })
  if (response.ok) return 'saved'
  if (response.status === 400 || response.status === 413) return 'refused'
  throw failure('photo not saved', response)
}

/** Removes the photo; throws when it did not happen. */
export async function removePhoto(): Promise<void> {
  ensureOk(
    await fetch('/api/profile/photo', { method: 'DELETE' }),
    'photo not removed',
  )
}
