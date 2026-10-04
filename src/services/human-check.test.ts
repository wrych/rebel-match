import { solveChallenge, type Challenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { describe, expect, it } from 'vitest'
import { createHumanCheck } from './human-check.js'

const secret = 's'.repeat(32)

/** What the widget sends back: the challenge and its solution, base64 JSON. */
async function solve(challenge: Challenge): Promise<string> {
  const solution = await solveChallenge({ challenge, deriveKey })
  if (solution === null) throw new Error('unsolved')
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64')
}

// A cheap cost keeps the tests fast; the protocol is the same.
function check(
  options: { secret?: string; now?: () => Date } = {},
): ReturnType<typeof createHumanCheck> {
  return createHumanCheck({
    secret: options.secret ?? secret,
    limits: () => ({ cost: 1, lifetimeMinutes: 5 }),
    ...(options.now === undefined ? {} : { now: options.now }),
  })
}

describe('createHumanCheck (R-NFR-8, ADR 0029)', () => {
  it('accepts a solved challenge it signed', async () => {
    const humanCheck = check()

    const payload = await solve(await humanCheck.challenge())

    expect(await humanCheck.verify(payload)).toBe(true)
  })

  it('accepts each solution once', async () => {
    const humanCheck = check()
    const payload = await solve(await humanCheck.challenge())

    expect(await humanCheck.verify(payload)).toBe(true)
    expect(await humanCheck.verify(payload)).toBe(false)
  })

  it('accepts one of two simultaneous uses of a solution', async () => {
    const humanCheck = check()
    const payload = await solve(await humanCheck.challenge())

    const results = await Promise.all([
      humanCheck.verify(payload),
      humanCheck.verify(payload),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('refuses a challenge another server signed', async () => {
    const theirs = check({ secret: 'o'.repeat(32) })

    const payload = await solve(await theirs.challenge())

    expect(await check().verify(payload)).toBe(false)
  })

  it('refuses an expired challenge', async () => {
    const humanCheck = check({ now: () => new Date(Date.now() - 6 * 60_000) })

    const payload = await solve(await humanCheck.challenge())

    expect(await humanCheck.verify(payload)).toBe(false)
  })

  it('refuses a challenge made easier after signing', async () => {
    const humanCheck = check()
    const challenge = await humanCheck.challenge()
    const easier = {
      ...challenge,
      parameters: { ...challenge.parameters, keyPrefix: '0' },
    }

    expect(await humanCheck.verify(await solve(easier))).toBe(false)
  })

  it.each(['', 'not base64 json', Buffer.from('{}').toString('base64')])(
    'refuses a malformed payload %j',
    async (payload) => {
      expect(await check().verify(payload)).toBe(false)
    },
  )
})
