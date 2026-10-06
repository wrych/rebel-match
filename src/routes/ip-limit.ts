import type { Request, RequestHandler } from 'express'
import type { WindowCounter } from '../services/rate-limit.js'

/** The client's address as Express reads it: from `X-Forwarded-For` only
 * through the proxy hops `trust proxy` allows, else the socket's (R-NFR-8). */
export function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown'
}

/** The sign-in requests the per-IP backstop counts (R-NFR-8, design §8). */
export const SIGN_IN_POSTS = [
  '/auth/request-link',
  '/auth/applicant',
  '/auth/verify',
  '/auth/invite-opened',
] as const

/** Answers `429` once an address has made `limit()` requests in the counter's
 * window; mounted on `SIGN_IN_POSTS`, so Express's own path matching decides
 * what counts. */
export function limitPerIp(
  counter: WindowCounter,
  limit: () => number,
): RequestHandler {
  return (request, response, next) => {
    if (!counter.take(clientIp(request), limit())) {
      response.status(429).json({ error: 'too_many_requests' })
      return
    }
    next()
  }
}
