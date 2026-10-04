import type { Challenge, HumanCheck } from './human-check.js'
import type { WindowCounter } from './rate-limit.js'

/** Who is asking: the client's address, and the solved human check when the
 * request carries one. */
export interface Client {
  ip: string
  altcha?: string | undefined
}

export type GateDecision =
  | { result: 'admit' }
  | { result: 'human-check'; challenge: Challenge }
  | { result: 'try-later' }

/** Paces something per key within a window (R-NFR-8): free up to a number of
 * uses, then each needs a human check, then none until the window ends. Only
 * what the caller reports as done counts. */
export interface PacedGate {
  admit(key: string, altcha: string | undefined): Promise<GateDecision>
  recorded(key: string): void
}

export function createPacedGate(deps: {
  counter: WindowCounter
  humanCheck: HumanCheck
  freeUses: number
  ceiling: number
}): PacedGate {
  return {
    admit: async (key, altcha) => {
      const recent = deps.counter.count(key)
      if (recent >= deps.ceiling) return { result: 'try-later' }
      if (recent < deps.freeUses) return { result: 'admit' }

      const solved =
        altcha !== undefined && (await deps.humanCheck.verify(altcha))
      return solved
        ? { result: 'admit' }
        : {
            result: 'human-check',
            challenge: await deps.humanCheck.challenge(),
          }
    },
    recorded: (key) => {
      deps.counter.add(key)
    },
  }
}
