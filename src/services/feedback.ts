import type { Challenge } from './human-check.js'
import { renderMail } from './mail-layout.js'
import type { Mailer } from './mailer.js'
import type { PacedGate } from './paced-gate.js'

/** What someone wrote on the feedback form; name and email only if given. */
export interface FeedbackNote {
  message: string
  name?: string | undefined
  email?: string | undefined
  /** The route name of the screen the form was opened from. */
  screen?: string | undefined
}

/** Who sends it: a signed-in member, or a visitor by network and the human
 * check they solved. */
export type FeedbackSender =
  { memberId: string } | { ip: string; altcha?: string | undefined }

export type FeedbackOutcome =
  | { result: 'sent' }
  | { result: 'human-check'; challenge: Challenge }
  | { result: 'try-later' }
  | { result: 'not-sent' }

/** Emails feedback to the product owner (R-FB-1), paced per member or per
 * network, a visitor human-checked each time (R-FB-2). */
export interface FeedbackService {
  send(note: FeedbackNote, from: FeedbackSender): Promise<FeedbackOutcome>
}

const SUBJECT = 'Feedback on Rebel Match'
const NOT_GIVEN = 'not given'

function signedBy(note: FeedbackNote, from: FeedbackSender): string {
  const who = 'memberId' in from ? 'a signed-in member' : 'a visitor'
  return (
    `From ${who}. Name: ${note.name ?? NOT_GIVEN}. ` +
    `Email: ${note.email ?? NOT_GIVEN}. Screen: ${note.screen ?? NOT_GIVEN}.`
  )
}

export function createFeedback(deps: {
  mailer: Mailer
  to: () => string
  members: PacedGate
  visitors: PacedGate
}): FeedbackService {
  function gateFor(from: FeedbackSender): {
    gate: PacedGate
    key: string
    altcha: string | undefined
  } {
    return 'memberId' in from
      ? { gate: deps.members, key: from.memberId, altcha: undefined }
      : { gate: deps.visitors, key: from.ip, altcha: from.altcha }
  }

  return {
    send: async (note, from) => {
      const { gate, key, altcha } = gateFor(from)
      const decision = await gate.admit(key, altcha)
      if (decision.result !== 'admit') return decision
      const status = await deps.mailer.send({
        memberId: 'memberId' in from ? from.memberId : null,
        to: deps.to(),
        kind: 'feedback',
        subject: SUBJECT,
        ...renderMail({
          heading: 'New feedback',
          preview: note.message,
          blocks: [
            { kind: 'quote', text: note.message },
            { kind: 'aside', text: signedBy(note, from) },
          ],
          footer: {
            reason: 'You get this email because the feedback form sends here.',
          },
        }),
      })
      if (status === 'failed') {
        gate.release(key)
        return { result: 'not-sent' }
      }
      return { result: 'sent' }
    },
  }
}
