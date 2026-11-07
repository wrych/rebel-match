import express, { Router, type RequestHandler } from 'express'
import type { AuthProvider } from '../auth/index.js'
import type { LiveSettings } from '../config.js'
import type { PhotoService } from '../services/photo.js'
import { requireSession, type GuardedLocals } from './require-permission.js'

/** While hosts have photos off, their addresses are as absent as ones that
 * never existed (R-PROF-5, R-NAV-8). */
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
  'Cache-Control': 'private, no-cache',
}

const memberOf = (response: express.Response): string =>
  (response.locals as GuardedLocals).member.id

/** `GET`, `PUT` and `DELETE /api/profile/photo` (design §3): the member's
 * own photo, as a picture only, replaced once cleaned, or removed; nobody
 * else's (R-PROF-5, ADR 0066). */
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
    const photo = await deps.photos.own(memberOf(response))
    if (photo === null) {
      response.status(404).json({ error: 'not_found' })
      return
    }
    response.set(PICTURE_ONLY).send(photo.jpeg)
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
