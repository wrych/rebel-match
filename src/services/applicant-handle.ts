import { createHmac, timingSafeEqual } from 'node:crypto'

// The purpose label keeps this MAC from ever matching a session cookie's,
// though both are made with the same secret.
const PURPOSE = 'applicant:'

export interface ApplicantHandles {
  /** The handle the access-requested answer carries for this address. */
  issue(email: string): string
  /** The address a handle was issued for, or null when it does not hold. */
  read(handle: string): string | null
}

function mac(email: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(PURPOSE + email)
    .digest('base64url')
}

/** Handles that let a pending applicant describe their own request without a
 * session, and nobody else: the address with its HMAC, so knowing someone's
 * email is not enough to label their request (design §3, R-AUTH-11). */
export function createApplicantHandles(secret: string): ApplicantHandles {
  return {
    issue: (email) =>
      `${Buffer.from(email).toString('base64url')}.${mac(email, secret)}`,
    read: (handle) => {
      const dot = handle.indexOf('.')
      if (dot <= 0) return null

      const email = Buffer.from(handle.slice(0, dot), 'base64url').toString()
      const given = Buffer.from(handle.slice(dot + 1))
      const expected = Buffer.from(mac(email, secret))
      if (given.length !== expected.length) return null

      return timingSafeEqual(given, expected) ? email : null
    },
  }
}
