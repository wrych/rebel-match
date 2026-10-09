import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { createInvokerCheck, type InvokerCheck } from './tick-invoker.js'

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

const INVOKER = 'scheduler-tick@project.iam.gserviceaccount.com'
const AUDIENCE = 'https://rebel-match-123.europe-west6.run.app'

let sign: (claims: JWTPayload, key?: Key) => Promise<string>
let check: InvokerCheck
let strangerKey: Key
let googleKey: Key

beforeAll(async () => {
  const google = await generateKeyPair('RS256')
  strangerKey = (await generateKeyPair('RS256')).privateKey
  googleKey = google.privateKey
  const jwk = {
    ...(await exportJWK(google.publicKey)),
    kid: 'k1',
    alg: 'RS256',
  }
  check = createInvokerCheck({
    invoker: INVOKER,
    audience: AUDIENCE,
    keys: createLocalJWKSet({ keys: [jwk] }),
  })
  sign = (claims, key = google.privateKey) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key)
})

const scheduler = { aud: AUDIENCE, email: INVOKER, email_verified: true }

describe('createInvokerCheck (ADR 0049)', () => {
  it('believes the scheduler, signed by Google for this audience', async () => {
    expect(await check(`Bearer ${await sign(scheduler)}`)).toBe(true)
  })

  it.each([
    ['another account', { ...scheduler, email: 'someone@example.invalid' }],
    ['an unverified address', { ...scheduler, email_verified: false }],
    ['another audience', { ...scheduler, aud: 'https://elsewhere.invalid' }],
  ])('refuses a token for %s', async (_, claims) => {
    expect(await check(`Bearer ${await sign(claims)}`)).toBe(false)
  })

  it('refuses a token signed by a key Google did not publish', async () => {
    expect(await check(`Bearer ${await sign(scheduler, strangerKey)}`)).toBe(
      false,
    )
  })

  it('refuses an expired token', async () => {
    const expired = await new SignJWT(scheduler)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setExpirationTime(0)
      .sign(googleKey)

    expect(await check(`Bearer ${expired}`)).toBe(false)
  })

  it.each([undefined, '', 'Basic abc', 'Bearer not-a-token'])(
    'refuses the header %j',
    async (header) => {
      expect(await check(header)).toBe(false)
    },
  )
})
