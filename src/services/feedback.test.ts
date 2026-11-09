import { describe, expect, it } from 'vitest'
import { createFeedback } from './feedback.js'
import type { HumanCheck } from './human-check.js'
import type { DeliveryStatus, Mailer, OutboundMessage } from './mailer.js'
import { createPacedGate } from './paced-gate.js'
import { createWindowCounter } from './rate-limit.js'

const challenge = { parameters: {}, signature: 'sig' } as never
const CEILING = 2

function setup(status: DeliveryStatus = 'sent'): {
  feedback: ReturnType<typeof createFeedback>
  sent: OutboundMessage[]
} {
  const sent: OutboundMessage[] = []
  const mailer: Mailer = {
    send: (message) => {
      sent.push(message)
      return Promise.resolve(status)
    },
  }
  const humanCheck: HumanCheck = {
    challenge: () => Promise.resolve(challenge),
    verify: (payload) => Promise.resolve(payload === 'solved'),
  }
  const gate = (freeUses: number): ReturnType<typeof createPacedGate> =>
    createPacedGate({
      counter: createWindowCounter({ windowMinutes: () => 60 }),
      humanCheck,
      limits: () => ({ freeUses, ceiling: CEILING }),
    })
  const feedback = createFeedback({
    mailer,
    to: () => 'owner@example.invalid',
    members: gate(CEILING),
    visitors: gate(0),
  })
  return { feedback, sent }
}

describe('createFeedback', () => {
  it('emails the owner what a member wrote, with the name, email and screen, erased with them (R-FB-1)', async () => {
    const { feedback, sent } = setup()

    const outcome = await feedback.send(
      {
        message: 'The deck is lovely.',
        name: 'Ada Lovelace',
        email: 'ada@example.invalid',
        screen: 'matches',
      },
      { memberId: 'm-ada' },
    )

    expect(outcome).toEqual({ result: 'sent' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      memberId: 'm-ada',
      to: 'owner@example.invalid',
      kind: 'feedback',
      subject: 'Feedback on Rebel Match',
    })
    expect(sent[0]?.text).toContain('The deck is lovely.')
    expect(sent[0]?.text).toContain(
      'From a signed-in member. Name: Ada Lovelace. ' +
        'Email: ada@example.invalid. Screen: matches.',
    )
  })

  it('asks a visitor for the human check before anything is sent (R-FB-2)', async () => {
    const { feedback, sent } = setup()
    const note = { message: 'Hi' }

    expect(await feedback.send(note, { ip: '10.0.0.1' })).toEqual({
      result: 'human-check',
      challenge,
    })
    expect(sent).toHaveLength(0)

    expect(
      await feedback.send(note, { ip: '10.0.0.1', altcha: 'solved' }),
    ).toEqual({ result: 'sent' })
    expect(sent[0]?.memberId).toBeNull()
    expect(sent[0]?.text).toContain(
      'From a visitor. Name: not given. Email: not given. Screen: not given.',
    )
  })

  it('stops a member past the ceiling, without a check (R-FB-2)', async () => {
    const { feedback, sent } = setup()
    const member = { memberId: 'm-ada' }

    for (let i = 0; i < CEILING; i++)
      expect(await feedback.send({ message: 'Hi' }, member)).toEqual({
        result: 'sent',
      })

    expect(await feedback.send({ message: 'Hi' }, member)).toEqual({
      result: 'try-later',
    })
    expect(sent).toHaveLength(CEILING)
  })

  it('does not count a message that could not be sent', async () => {
    const { feedback } = setup('failed')
    const member = { memberId: 'm-ada' }

    for (let i = 0; i <= CEILING; i++)
      expect(await feedback.send({ message: 'Hi' }, member)).toEqual({
        result: 'not-sent',
      })
  })
})
