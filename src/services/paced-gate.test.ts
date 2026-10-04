import { describe, expect, it } from 'vitest'
import type { HumanCheck } from './human-check.js'
import { createPacedGate } from './paced-gate.js'
import { createWindowCounter } from './rate-limit.js'

const challenge = { parameters: {}, signature: 'sig' } as never

function setup(): ReturnType<typeof createPacedGate> {
  const humanCheck: HumanCheck = {
    challenge: () => Promise.resolve(challenge),
    verify: (payload) => Promise.resolve(payload === 'solved'),
  }
  return createPacedGate({
    counter: createWindowCounter({ windowMinutes: 1 }),
    humanCheck,
    freeUses: 2,
    ceiling: 3,
  })
}

describe('createPacedGate (R-NFR-8)', () => {
  it('admits freely below the free uses', async () => {
    const gate = setup()
    gate.recorded('a')

    expect(await gate.admit('a', undefined)).toEqual({ result: 'admit' })
  })

  it('asks for the human check past the free uses, and admits once it is solved', async () => {
    const gate = setup()
    gate.recorded('a')
    gate.recorded('a')

    expect(await gate.admit('a', undefined)).toEqual({
      result: 'human-check',
      challenge,
    })
    expect(await gate.admit('a', 'wrong')).toEqual({
      result: 'human-check',
      challenge,
    })
    expect(await gate.admit('a', 'solved')).toEqual({ result: 'admit' })
  })

  it('admits nothing past the ceiling, solved or not', async () => {
    const gate = setup()
    for (let i = 0; i < 3; i++) gate.recorded('a')

    expect(await gate.admit('a', 'solved')).toEqual({ result: 'try-later' })
  })

  it('paces each key on its own', async () => {
    const gate = setup()
    for (let i = 0; i < 3; i++) gate.recorded('a')

    expect(await gate.admit('b', undefined)).toEqual({ result: 'admit' })
  })
})
