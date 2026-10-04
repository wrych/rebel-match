import { describe, expect, it } from 'vitest'
import type { HumanCheck } from './human-check.js'
import { createPacedGate } from './paced-gate.js'
import { createWindowCounter } from './rate-limit.js'

const challenge = { parameters: {}, signature: 'sig' } as never

// Any payload except 'wrong' is solved, each once, after a turn of the event
// loop as the real check takes.
function setup(): ReturnType<typeof createPacedGate> {
  const humanCheck: HumanCheck = {
    challenge: () => Promise.resolve(challenge),
    verify: (payload) =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(payload !== 'wrong')
        }, 0)
      }),
  }
  return createPacedGate({
    counter: createWindowCounter({ windowMinutes: 1 }),
    humanCheck,
    freeUses: 2,
    ceiling: 3,
  })
}

async function admitN(
  gate: ReturnType<typeof createPacedGate>,
  n: number,
  altcha?: string,
): Promise<string[]> {
  const decisions = []
  for (let i = 0; i < n; i++)
    decisions.push((await gate.admit('a', altcha)).result)
  return decisions
}

describe('createPacedGate (R-NFR-8)', () => {
  it('admits freely up to the free uses, then asks for the human check', async () => {
    const gate = setup()

    expect(await admitN(gate, 3)).toEqual(['admit', 'admit', 'human-check'])
  })

  it('admits past the free uses once the check is solved, but not a wrong one', async () => {
    const gate = setup()
    await admitN(gate, 2)

    expect(await gate.admit('a', 'wrong')).toEqual({
      result: 'human-check',
      challenge,
    })
    expect(await gate.admit('a', 'solved')).toEqual({ result: 'admit' })
  })

  it('admits nothing past the ceiling, solved or not', async () => {
    const gate = setup()
    await admitN(gate, 2)
    await gate.admit('a', 'solved')

    expect(await gate.admit('a', 'solved-again')).toEqual({
      result: 'try-later',
    })
  })

  it('counts simultaneous requests one by one', async () => {
    const gate = setup()

    const decisions = await Promise.all(
      Array.from({ length: 10 }, (_, i) => gate.admit('a', `p${String(i)}`)),
    )

    expect(decisions.filter((d) => d.result === 'admit')).toHaveLength(3)
  })

  it('gives back a use that did not happen', async () => {
    const gate = setup()
    await admitN(gate, 2)

    gate.release('a')

    expect(await gate.admit('a', undefined)).toEqual({ result: 'admit' })
  })

  it('paces each key on its own', async () => {
    const gate = setup()
    await admitN(gate, 2)
    await gate.admit('a', 'solved')

    expect(await gate.admit('b', undefined)).toEqual({ result: 'admit' })
  })
})
