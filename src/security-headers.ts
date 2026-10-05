import type { RequestHandler } from 'express'
import helmet from 'helmet'

const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

/** The headers every response carries (ADR 0034): a Content-Security-Policy
 * that allows only this origin and no inline script, no framing, no MIME
 * sniffing, no referrer, and HSTS once the app is served over https. */
export function securityHeaders(config: { publicUrl: string }): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    strictTransportSecurity: config.publicUrl.startsWith('https:')
      ? { maxAge: HSTS_MAX_AGE_SECONDS }
      : false,
  })
}
