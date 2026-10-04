import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import express, { Router } from 'express'
import { IMMUTABLE_ASSET_MAX_AGE_MS } from '../config.js'
import { isKnownPath } from '../routes.js'

/** Paths the server answers itself; the shell never stands in for them. */
const SERVER_PATH = /^\/(api|auth)(\/|$)/

/** Serves the built client in `dir` (ADR 0017): its files, and the shell for
 * any other GET — `200` for a path in the route table, `404` otherwise.
 * Throws when `dir` has no shell, so a broken deployment fails at boot. */
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
      maxAge: IMMUTABLE_ASSET_MAX_AGE_MS,
    }),
    // An asset from an older build: a plain 404, never the shell.
    (_request, response) => {
      response.sendStatus(404)
    },
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
