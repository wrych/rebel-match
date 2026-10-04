import { describe, expect, it } from 'vitest'
import { createApplicantGate } from './applicant-gate.js'
import type { HumanCheck } from './human-check.js'
import { createWindowCounter } from './rate-limit.js'

const challenge = { parameters: {}, signature: 'sig' } as never
const limits = { applicantsBeforeCheck: 2, applicantsCeiling: 3 }

function setup(): ReturnType<typeof createApplicantGate> {
  const humanCheck: HumanCheck = {
    challenge: () => Promise.resolve(challenge),
    verify: (payload) => Promise.resolve(payload === 'solved'),
  }
  return createApplicantGate({
    counter: createWindowCounter({ windowMinutes: 1 }),
    humanCheck,
    limits,
  })
}

describe('createApplicantGate (R-NFR-8)', () => {
  it('admits freely below the cap', async () => {
    const gate = setup()
    gate.recorded({ ip: 'a' })

    expect(await gate.admit({ ip: 'a' })).toEqual({ result: 'admit' })
  })

  it('asks for the human check at the cap, and admits once it is solved', async () => {
    const gate = setup()
    gate.recorded({ ip: 'a' })
    gate.recorded({ ip: 'a' })

    expect(await gate.admit({ ip: 'a' })).toEqual({
      result: 'human-check',
      challenge,
    })
    expect(await gate.admit({ ip: 'a', altcha: 'wrong' })).toEqual({
      result: 'human-check',
      challenge,
    })
    expect(await gate.admit({ ip: 'a', altcha: 'solved' })).toEqual({
      result: 'admit',
    })
  })

  it('admits nobody past the ceiling, solved or not', async () => {
    const gate = setup()
    for (let i = 0; i < 3; i++) gate.recorded({ ip: 'a' })

    expect(await gate.admit({ ip: 'a', altcha: 'solved' })).toEqual({
      result: 'try-later',
    })
  })

  it('paces each address on its own', async () => {
    const gate = setup()
    for (let i = 0; i < 3; i++) gate.recorded({ ip: 'a' })

    expect(await gate.admit({ ip: 'b' })).toEqual({ result: 'admit' })
  })
})
