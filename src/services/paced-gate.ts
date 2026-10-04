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
 * uses, then each needs a human check, then none until the window ends. An
 * admitted use counts at once, so simultaneous requests cannot share one. */
export interface PacedGate {
  admit(key: string, altcha: string | undefined): Promise<GateDecision>
  /** Takes back an admitted use that did not happen. */
  release(key: string): void
}

export function createPacedGate(deps: {
  counter: WindowCounter
  humanCheck: HumanCheck
  /** Read at each use, so a host's change applies at once (R-CFG-6). */
  freeUses: () => number
  ceiling: () => number
}): PacedGate {
  return {
    admit: async (key, altcha) => {
      const free = deps.counter.count(key) < deps.freeUses()
      const solved =
        !free && altcha !== undefined && (await deps.humanCheck.verify(altcha))

      // Checked and counted with no await between, after the verify above.
      const recent = deps.counter.count(key)
      if (recent >= deps.ceiling()) return { result: 'try-later' }
      if (recent < deps.freeUses() || solved) {
        deps.counter.add(key)
        return { result: 'admit' }
      }
      return {
        result: 'human-check',
        challenge: await deps.humanCheck.challenge(),
      }
    },
    release: (key) => {
      deps.counter.remove(key)
    },
  }
}
