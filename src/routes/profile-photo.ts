import express, { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { PhotoService, StoredPhoto } from '../services/photo.js'
import {
  requirePermission,
  requireSession,
  type GuardedLocals,
} from './require-permission.js'

/** While hosts have photos off, their addresses are as absent as ones that
 * never existed (R-PROF-6, R-NAV-8). */
function whilePhotosOn(settings: Pick<LiveSettings, 'limits'>): RequestHandler {
  return (_request, response, next) => {
    if (settings.limits().profilePhotos === 1) {
      next()
      return
    }
    response.status(404).json({ error: 'not_found' })
  }
}

const PICTURE_ONLY = {
  'Content-Type': 'image/jpeg',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
}
// A key names one upload and is never reused, so its picture never changes
// (ADR 0067); one's own address stays the same across uploads.
const FOR_GOOD = 'private, max-age=31536000, immutable'
const ASK_AGAIN = 'private, no-cache'

const memberOf = (response: express.Response): string =>
  (response.locals as GuardedLocals).member.id

const keyParams = z.object({ key: z.string().regex(/^[\w-]{43}$/) })
const memberParams = z.object({ id: z.string().min(1).max(36) })

function send(
  response: express.Response,
  photo: StoredPhoto | null,
  cache: string,
): void {
  if (photo === null) {
    response.status(404).json({ error: 'not_found' })
    return
  }
  response.set({ ...PICTURE_ONLY, 'Cache-Control': cache }).send(photo.jpeg)
}

/** `GET /api/photos/:key` and `GET /api/admin/members/:id/photo` (design
 * §3): another member's photo by the key their cards carry, and any
 * member's for the host tools, each as a picture only (R-PROF-7, R-MEM-2,
 * ADR 0067). */
export function sharedPhotoRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'limits'>
  photos: PhotoService
}): Router {
  const router = Router()
  const photosOn = whilePhotosOn(deps.settings)

  router.get(
    '/api/photos/:key',
    photosOn,
    requireSession(deps.auth),
    async (request, response) => {
      const params = keyParams.safeParse(request.params)
      const photo = params.success
        ? await deps.photos.shared(params.data.key)
        : null
      send(response, photo, FOR_GOOD)
    },
  )

  router.get(
    '/api/admin/members/:id/photo',
    photosOn,
    requirePermission(deps.auth, 'member:delete'),
    async (request, response) => {
      const params = memberParams.safeParse(request.params)
      const photo = params.success
        ? await deps.photos.own(params.data.id)
        : null
      send(response, photo, ASK_AGAIN)
    },
  )

  return router
}

/** `GET`, `PUT` and `DELETE /api/profile/photo` (design §3): the member's
 * own photo, as a picture only, replaced once cleaned, or removed
 * (R-PROF-6, ADR 0066). */
export function profilePhotoRoutes(deps: {
  auth: AuthProvider
  settings: Pick<LiveSettings, 'limits'>
  photos: PhotoService
}): Router {
  const router = Router()
  const guards = [whilePhotosOn(deps.settings), requireSession(deps.auth)]
  const jpegBody: RequestHandler = (request, response, next) => {
    express.raw({
      type: 'image/jpeg',
      limit: deps.settings.limits().photoMaxBytes,
    })(request, response, next)
  }

  router.get('/api/profile/photo', ...guards, async (_request, response) => {
    send(response, await deps.photos.own(memberOf(response)), ASK_AGAIN)
  })

  router.put(
    '/api/profile/photo',
    ...guards,
    jpegBody,
    async (request, response) => {
      const upload: unknown = request.body
      const outcome = Buffer.isBuffer(upload)
        ? await deps.photos.replace(memberOf(response), upload)
        : 'refused'
      if (outcome === 'refused') {
        response.status(400).json({ error: 'bad_photo' })
        return
      }
      response.status(204).end()
    },
  )

  router.delete('/api/profile/photo', ...guards, async (_request, response) => {
    await deps.photos.remove(memberOf(response))
    response.status(204).end()
  })

  return router
}
