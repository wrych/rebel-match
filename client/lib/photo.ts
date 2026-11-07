import { ensureOk, failure } from './request'

/** How the browser shapes a photo before it travels (R-PROF-5). */
export interface PhotoShape {
  photoSidePx: number
  photoJpegQuality: number
}

/** The largest centred square of a picture `width` by `height`, as the
 * source rectangle to draw from. */
export function centreSquare(
  width: number,
  height: number,
): { x: number; y: number; side: number } {
  const side = Math.min(width, height)
  return {
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    side,
  }
}

/** The chosen picture cropped to its centre square and scaled down to
 * `photoSidePx` as a JPEG, so the original never leaves the device; throws
 * when the browser cannot read it (ADR 0066). */
export async function squarePhoto(
  file: Blob,
  shape: PhotoShape,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const crop = centreSquare(bitmap.width, bitmap.height)
  const side = Math.min(crop.side, shape.photoSidePx)
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('no canvas')
  context.drawImage(
    bitmap,
    crop.x,
    crop.y,
    crop.side,
    crop.side,
    0,
    0,
    side,
    side,
  )
  bitmap.close()
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
