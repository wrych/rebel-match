import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

const GOOGLE_KEYS = new URL('https://www.googleapis.com/oauth2/v3/certs')
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/** True only for a request carrying a Google-signed ID token. */
export type InvokerCheck = (
  authorization: string | undefined,
) => Promise<boolean>

/** Believes a tick only from `invoker`: a bearer ID token Google signed for
 * that verified address and `audience` (ADR 0048). Anything else is false,
 * never an error. `keys` defaults to Google's published keys. */
export function createInvokerCheck(deps: {
  invoker: string
  audience: string
  keys?: JWTVerifyGetKey
}): InvokerCheck {
  const keys = deps.keys ?? createRemoteJWKSet(GOOGLE_KEYS)

  return async (authorization) => {
    const token = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1]
    if (token === undefined) return false
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: GOOGLE_ISSUERS,
        audience: deps.audience,
      })
      return payload.email === deps.invoker && payload.email_verified === true
    } catch {
      return false
    }
  }
}
