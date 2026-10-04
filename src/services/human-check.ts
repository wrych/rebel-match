import { createHmac } from 'node:crypto'
import {
  CappedMap,
  createChallenge,
  randomInt,
  verifySolution,
  type Challenge,
  type Payload,
} from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { z } from 'zod'
import { MS_PER_MINUTE } from '../time.js'

export type { Challenge }

const ALGORITHM = 'PBKDF2/SHA-256'
// The browser tries counters from zero until one matches, so the hidden counter
// sets how many derivations a solve takes: at the default cost, about a second
// on a phone with the widget's workers.
const COUNTER_MIN = 1000
const COUNTER_MAX = 3000
// Payloads accepted within one challenge lifetime; past it the oldest go, and
// by then they have expired anyway unless the server is flooded.
const SPENT_MAX = 50_000
/** A solved payload is about 700 characters; the cap bounds the work of
 * decoding one, a fact of the format rather than a tunable. */
export const PAYLOAD_MAX_CHARS = 8192

/** A self-hosted proof of work that a browser solves unattended (ADR 0029). */
export interface HumanCheck {
  /** A fresh challenge signed by this server. */
  challenge(): Promise<Challenge>
  /** True once for each solved, unexpired challenge this server signed; the
   * widget's payload is base64 JSON. */
  verify(payload: string): Promise<boolean>
}

// The parameters are kept whole, unknown keys too: the signature covers them.
const payloadShape = z.object({
  challenge: z.object({
    parameters: z
      .object({
        algorithm: z.literal(ALGORITHM),
        nonce: z.string(),
        salt: z.string(),
        cost: z.number(),
        keyLength: z.number(),
        keyPrefix: z.string(),
      })
      .loose(),
    signature: z.string(),
  }),
  solution: z.object({
    counter: z.number().int().nonnegative(),
    derivedKey: z.string(),
    time: z.number().optional(),
  }),
})

// The purpose labels keep these keys from matching a session cookie's or an
// applicant handle's MAC, though all come from the same secret.
function derive(secret: string, purpose: string): string {
  return createHmac('sha256', secret).update(purpose).digest('hex')
}

function parse(payload: string): Payload | null {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf8'),
    )
    // Checked for shape, then passed on as decoded, so nothing is reordered
    // or dropped before the signature check.
    return payloadShape.safeParse(decoded).success ? (decoded as Payload) : null
  } catch {
    return null
  }
}

export function createHumanCheck(options: {
  secret: string
  limits: () => { cost: number; lifetimeMinutes: number }
  now?: () => Date
}): HumanCheck {
  const now = options.now ?? ((): Date => new Date())
  const signatureSecret = derive(options.secret, 'altcha-signature:')
  const keySecret = derive(options.secret, 'altcha-key:')
  const spent = new CappedMap<string, true>({ maxSize: SPENT_MAX })

  return {
    challenge: () => {
      const { cost, lifetimeMinutes } = options.limits()
      return createChallenge({
        algorithm: ALGORITHM,
        cost,
        counter: randomInt(COUNTER_MAX, COUNTER_MIN),
        deriveKey,
        expiresAt: new Date(now().getTime() + lifetimeMinutes * MS_PER_MINUTE),
        hmacSignatureSecret: signatureSecret,
        hmacKeySignatureSecret: keySecret,
      })
    },
    verify: async (payload) => {
      const parsed = parse(payload)
      if (parsed === null) return false
      const { challenge, solution } = parsed
      const nonce = challenge.parameters.nonce
      if (spent.has(nonce)) return false
      const result = await verifySolution({
        challenge,
        solution,
        deriveKey,
        hmacSignatureSecret: signatureSecret,
        hmacKeySignatureSecret: keySecret,
      })
      if (!result.verified || spent.has(nonce)) return false
      spent.set(nonce, true)
      return true
    },
  }
}
