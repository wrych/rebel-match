import { apiPaths, fill } from '../../src/api-paths'
import { sharedPhotoPath } from '../../src/photo-paths'
import { fetchConfig } from './api'
import type { Crop } from './crop'
import { fetchProfile } from './profile'
import { ensureOk, failure } from './request'

/** How the browser shapes a photo before it travels (R-PROF-6). */
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
  `${apiPaths.ownPhoto}?v=${encodeURIComponent(photoAt)}`

/** Saves the photo; `refused` when the server would not take it, a throw for
 * anything else, so a failure is never shown as saved (R-PROF-6). */
export async function savePhoto(jpeg: Blob): Promise<'saved' | 'refused'> {
  const response = await fetch(apiPaths.ownPhoto, {
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
    await fetch(apiPaths.ownPhoto, { method: 'DELETE' }),
    'photo not removed',
  )
}

/** Where a card's photo key is read, null for a member without one
 * (R-PROF-7). */
export const photoSrc = (key: string | null): string | null =>
  key === null ? null : sharedPhotoPath(key)

/** A member's photo for the host tools, a new address with each new photo
 * (R-MEM-2). */
export const memberPhotoUrl = (memberId: string, key: string): string =>
  `${fill(apiPaths.memberPhoto, { id: memberId })}?v=${encodeURIComponent(key)}`

/** The member's own photo while hosts have photos on, else null, for the
 * replay to draw their point as (R-NET-2, R-PROF-7). */
export async function ownPhoto(): Promise<string | null> {
  const [config, profile] = await Promise.all([fetchConfig(), fetchProfile()])
  if (config.limits.profilePhotos !== 1 || profile.photoAt === null) return null
  return ownPhotoUrl(profile.photoAt)
}
