import type { AbuseLimits } from '../config.js'
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

/** Paces new applicants per IP address (R-NFR-8): past the cap each needs a
 * human check, past the ceiling none is recorded until the window ends. Only a
 * recorded applicant counts, so members and repeat requests never do. */
export interface ApplicantGate {
  admit(client: Client): Promise<GateDecision>
  recorded(client: Client): void
}

export function createApplicantGate(deps: {
  counter: WindowCounter
  humanCheck: HumanCheck
  limits: Pick<AbuseLimits, 'applicantsBeforeCheck' | 'applicantsCeiling'>
}): ApplicantGate {
  return {
    admit: async (client) => {
      const recent = deps.counter.count(client.ip)
      if (recent >= deps.limits.applicantsCeiling)
        return { result: 'try-later' }
      if (recent < deps.limits.applicantsBeforeCheck) return { result: 'admit' }

      const solved =
        client.altcha !== undefined &&
        (await deps.humanCheck.verify(client.altcha))
      return solved
        ? { result: 'admit' }
        : {
            result: 'human-check',
            challenge: await deps.humanCheck.challenge(),
          }
    },
    recorded: (client) => {
      deps.counter.add(client.ip)
    },
  }
}
