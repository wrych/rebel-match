/** A seeded random source: the same seed deals the same day, so a test can
 * replay one exactly (`specs/design.md`, The 9toRevolution game). */
export interface Random {
  /** The next number in [0, 1), and the state that follows it. */
  next(state: number): [value: number, state: number]
}

const UINT32 = 0x1_0000_0000
const INCREMENT = 0x6d2b79f5

// mulberry32: small, fast and good enough to shuffle an office.
export const mulberry32: Random = {
  next: (state) => {
    const nextState = (state + INCREMENT) | 0
    let t = nextState
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return [((t ^ (t >>> 14)) >>> 0) / UINT32, nextState]
  },
}

/** A whole number in [0, below). */
export function pick(random: number, below: number): number {
  return Math.min(below - 1, Math.floor(random * below))
}
