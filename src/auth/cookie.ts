import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SessionCookie } from './types.js'

export const SESSION_COOKIE_NAME = 'rm_session'

function mac(raw: string, secret: string): string {
  return createHmac('sha256', secret).update(raw).digest('base64url')
}

/** The cookie value for a session id: the id and its HMAC, so a forged or
 * altered cookie is rejected before any lookup (R-NFR-5). */
export function signSessionId(raw: string, secret: string): string {
  return `${raw}.${mac(raw, secret)}`
}

/** The session id inside a signed value, or null when the signature does not
 * hold. */
export function unsignSessionId(value: string, secret: string): string | null {
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null

  const raw = value.slice(0, dot)
  const given = Buffer.from(value.slice(dot + 1))
  const expected = Buffer.from(mac(raw, secret))
  if (given.length !== expected.length) return null

  return timingSafeEqual(given, expected) ? raw : null
}

/** One cookie's value from a `Cookie` header, or null when it is absent. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  for (const pair of (header ?? '').split(';')) {
    const eq = pair.indexOf('=')
    if (eq !== -1 && pair.slice(0, eq).trim() === name) {
      return pair.slice(eq + 1).trim()
    }
  }

  return null
}

/** The session cookie: http-only, same-site lax, and persistent so a phone
 * that closes its browser stays signed in (R-AUTH-7, design §8). */
export function sessionCookie(
  value: string,
  maxAgeMs: number,
  secure: boolean,
): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeMs,
    },
  }
}
