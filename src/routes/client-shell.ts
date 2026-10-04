import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import express, { Router } from 'express'
import { isKnownPath } from '../routes.js'

/** Paths the server answers itself; the shell never stands in for them. */
const SERVER_PATH = /^\/(api|auth)(\/|$)/

/** A year: Vite names every asset after its content hash, so a changed file is
 * a new URL and the old one can be cached for good. */
const ASSET_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Serves the built client from `dir` (ADR 0017): the hashed assets as files,
 * and the shell for every other GET. A path in the route table gets `200`;
 * anything else gets the shell with `404`, and the client renders its
 * not-found screen. Reads `index.html` once, so a deployment without a built
 * client fails at boot rather than on the first visit.
 */
export function clientShellRoutes(dir: string): Router {
  const shellPath = join(dir, 'index.html')
  let shell: string
  try {
    shell = readFileSync(shellPath, 'utf8')
  } catch {
    throw new Error(
      `CLIENT_DIR has no ${shellPath}: run \`npm run build\` first, or unset ` +
        'CLIENT_DIR to let Vite serve the client (ADR 0017)',
    )
  }

  const router = Router()

  router.use(
    '/assets',
    express.static(join(dir, 'assets'), {
      immutable: true,
      maxAge: ASSET_MAX_AGE_MS,
      fallthrough: false,
    }),
  )
  router.use(express.static(dir, { index: false }))

  router.get(/.*/, (request, response, next) => {
    if (SERVER_PATH.test(request.path)) {
      next()
      return
    }
    response
      .status(isKnownPath(request.path) ? 200 : 404)
      .type('html')
      .set('Cache-Control', 'no-cache')
      .send(shell)
  })

  return router
}
