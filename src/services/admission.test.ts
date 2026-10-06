import { describe, expect, it } from 'vitest'
import type { LinkOptions } from '../auth/index.js'
import type { PacedGate } from './paced-gate.js'
import { createApplicantHandles } from './applicant-handle.js'
import type { Redemption } from './invite-redemption.js'
import {
  admissionFor,
  type ApplicantDetails,
  createAdmission,
  type AdmissionStore,
  type MemberStatus,
} from './admission.js'

describe('admissionFor', () => {
  it.each([
    ['active', 'send-link'],
    [null, 'record-applicant'],
    ['applicant', 'already-asked'],
    ['rejected', 'not-approved'],
    ['deleted', 'set-to-be-deleted'],
  ] as const)('treats %s as %s (R-AUTH-1,2,4)', (status, admission) => {
    expect(admissionFor(status)).toBe(admission)
  })
})

const handles = createApplicantHandles('x'.repeat(32))
const client = { ip: '203.0.113.7' }
const openGate: PacedGate = {
  admit: () => Promise.resolve({ result: 'admit' }),
  release: () => undefined,
}

interface Harness {
  requestLink: (email: string, next?: string) => Promise<string>
  admission: ReturnType<typeof createAdmission>
  links: { email: string; next: string | undefined }[]
  issued: LinkOptions[]
  notified: string[]
  members: Map<string, MemberStatus>
  details: Map<string, ApplicantDetails>
}

function setup(
  initial: [string, MemberStatus][] = [],
  recordFails = false,
  redeem: (email: string, token: string) => Redemption = () => ({
    result: 'refused',
    refusal: 'unknown',
  }),
  limits: {
    applicants?: PacedGate
    linkEmails?: PacedGate
    ownDeletions?: Map<string, Date>
  } = {},
): Harness {
  const issued: LinkOptions[] = []
  const members = new Map(initial)
  const details = new Map<string, ApplicantDetails>()
  const links: Harness['links'] = []
  const notified: string[] = []
  const store: AdmissionStore = {
    statusByEmail: (email) => Promise.resolve(members.get(email) ?? null),
    // The reviewers' notifications are written with the applicant
    // (R-NOTE-10), so the store is where they are told.
    createApplicant: (email) => {
      if (recordFails) return Promise.reject(new Error('database unavailable'))
      if (members.has(email)) return Promise.resolve(false)
      members.set(email, 'applicant')
      notified.push(email)
      return Promise.resolve(true)
    },
    describeApplicant: (email, given) => {
      if (members.get(email) !== 'applicant') return Promise.resolve(false)
      details.set(email, { ...details.get(email), ...given })
      return Promise.resolve(true)
    },
    ownDeletion: (email) =>
      Promise.resolve(limits.ownDeletions?.get(email) ?? null),
  }
  const admission = createAdmission({
    store,
    handles,
    applicants: limits.applicants ?? openGate,
    linkEmails: limits.linkEmails ?? openGate,
    redeemInvite: (email, token) => {
      const redemption = redeem(email, token)
      if (redemption.result === 'admitted') members.set(email, 'active')
      return Promise.resolve(redemption)
    },
    auth: {
      issueLink: (email, opts) => {
        links.push({ email, next: opts.next })
        issued.push(opts)
        return Promise.resolve()
      },
    },
  })
  return {
    requestLink: async (email, next) =>
      (await admission.requestLink(email, { next, client })).state,
    admission,
    links,
    issued,
    notified,
    members,
    details,
  }
}

describe('createAdmission', () => {
  it('sends an active member a link, carrying next (R-AUTH-4, R-NAV-5)', async () => {
    const harness = setup([['ada@example.invalid', 'active']])

    expect(await harness.requestLink('ada@example.invalid', '/matches')).toBe(
      'check-email',
    )
    expect(harness.links).toEqual([
      { email: 'ada@example.invalid', next: '/matches' },
    ])
    expect(harness.notified).toEqual([])
  })

  it('records an unknown address as an applicant and notifies (R-AUTH-2)', async () => {
    const harness = setup()

    expect(await harness.requestLink('new@example.invalid')).toBe(
      'access-requested',
    )
    expect(harness.members.get('new@example.invalid')).toBe('applicant')
    expect(harness.notified).toEqual(['new@example.invalid'])
    expect(harness.links).toEqual([])
  })

  it('does not notify twice when a pending applicant asks again (F4)', async () => {
    const harness = setup()

    await harness.requestLink('new@example.invalid')
    expect(await harness.requestLink('new@example.invalid')).toBe(
      'access-requested',
    )

    expect(harness.notified).toHaveLength(1)
  })

  it('tells a rejected address plainly, with no link and no notice (R-AUTH-13)', async () => {
    const harness = setup([['no@example.invalid', 'rejected']])

    expect(await harness.requestLink('no@example.invalid')).toBe('not-approved')
    expect(harness.links).toEqual([])
    expect(harness.notified).toEqual([])
  })

  it('hands an applicant the handle for their own address (R-AUTH-11)', async () => {
    const harness = setup()

    const answer = await harness.admission.requestLink('new@example.invalid', {
      client,
    })

    expect(answer.handle).toBeDefined()
    expect(handles.read(String(answer.handle))).toBe('new@example.invalid')
  })

  it('hands no handle to a repeat request, which anyone can make', async () => {
    const harness = setup([['new@example.invalid', 'applicant']])

    expect(
      await harness.admission.requestLink('new@example.invalid', { client }),
    ).toEqual({
      state: 'access-requested',
    })
  })

  it('hands no handle with a link or a refusal', async () => {
    const harness = setup([
      ['ada@example.invalid', 'active'],
      ['no@example.invalid', 'rejected'],
    ])

    for (const email of ['ada@example.invalid', 'no@example.invalid']) {
      expect(
        await harness.admission.requestLink(email, { client }),
      ).not.toHaveProperty('handle')
    }
  })
})

describe('describeApplicant', () => {
  it("saves a pending applicant's name and org (R-AUTH-11,12)", async () => {
    const harness = setup([['new@example.invalid', 'applicant']])
    const handle = handles.issue('new@example.invalid')

    expect(
      await harness.admission.describeApplicant(handle, {
        name: 'Ada',
        org: 'Rebels',
      }),
    ).toBe('saved')
    expect(harness.details.get('new@example.invalid')).toEqual({
      name: 'Ada',
      org: 'Rebels',
    })
  })

  it('does not find a forged handle', async () => {
    const harness = setup([['new@example.invalid', 'applicant']])

    expect(
      await harness.admission.describeApplicant('bm9wZQ.forged', {
        name: 'Mallory',
      }),
    ).toBe('not-found')
    expect(harness.details.size).toBe(0)
  })

  it('does not find a request no longer pending', async () => {
    const harness = setup([['ada@example.invalid', 'active']])
    const handle = handles.issue('ada@example.invalid')

    expect(
      await harness.admission.describeApplicant(handle, { name: 'Ada' }),
    ).toBe('not-found')
  })
})

describe('requestLink with an invite (F15)', () => {
  const admit = (): Redemption => ({ result: 'admitted' })

  it('admits an unknown address through a usable invite and sends the link (R-INV-1)', async () => {
    const harness = setup([], false, admit)

    expect(
      await harness.admission.requestLink('new@example.invalid', {
        client,
        invite: 'tok',
        next: '/matches',
      }),
    ).toEqual({ state: 'check-email' })
    expect(harness.members.get('new@example.invalid')).toBe('active')
    expect(harness.links).toEqual([
      { email: 'new@example.invalid', next: '/matches' },
    ])
    expect(harness.notified).toEqual([])
  })

  it('queues the address with the notice when the invite is refused (R-INV-5)', async () => {
    const harness = setup([], false, () => ({
      result: 'refused',
      refusal: 'revoked',
    }))

    const answer = await harness.admission.requestLink('new@example.invalid', {
      client,
      invite: 'tok',
    })

    expect(answer).toMatchObject({
      state: 'access-requested',
      inviteRefused: true,
    })
    expect(answer.handle).toBeDefined()
    expect(harness.members.get('new@example.invalid')).toBe('applicant')
    expect(harness.notified).toEqual(['new@example.invalid'])
  })

  it('ignores the invite for a member, using no seat (F15)', async () => {
    const redeemed: string[] = []
    const harness = setup(
      [['ada@example.invalid', 'active']],
      false,
      (email) => {
        redeemed.push(email)
        return { result: 'admitted' }
      },
    )

    expect(
      await harness.admission.requestLink('ada@example.invalid', {
        client,
        invite: 'tok',
      }),
    ).toEqual({ state: 'check-email' })
    expect(redeemed).toEqual([])
  })

  it.each([
    ['applicant', 'access-requested'],
    ['rejected', 'not-approved'],
  ] as const)(
    'leaves an existing %s as it is, using no seat',
    async (status, state) => {
      const redeemed: string[] = []
      const harness = setup([['x@example.invalid', status]], false, (email) => {
        redeemed.push(email)
        return { result: 'admitted' }
      })

      expect(
        await harness.admission.requestLink('x@example.invalid', {
          client,
          invite: 'tok',
        }),
      ).toEqual({ state })
      expect(redeemed).toEqual([])
    },
  )

  it('treats an address that appeared meanwhile as that address', async () => {
    const harness = setup([], false, (email) => {
      harness.members.set(email, 'active')
      return { result: 'address_taken' }
    })

    expect(
      await harness.admission.requestLink('race@example.invalid', {
        client,
        invite: 'tok',
      }),
    ).toEqual({ state: 'check-email' })
  })
})

describe('createAdmission within the abuse limits (R-NFR-8)', () => {
  const challenge = { parameters: {}, signature: 'sig' } as never

  /** A gate answering `decision`, recording what it was asked and told. */
  function gate(decision: Awaited<ReturnType<PacedGate['admit']>>): {
    gate: PacedGate
    asked: { key: string; altcha: string | undefined }[]
    released: string[]
  } {
    const asked: { key: string; altcha: string | undefined }[] = []
    const released: string[] = []
    return {
      asked,
      released,
      gate: {
        admit: (key, altcha) => {
          asked.push({ key, altcha })
          return Promise.resolve(decision)
        },
        release: (key) => {
          released.push(key)
        },
      },
    }
  }

  describe('link emails, per address (ADR 0030)', () => {
    it('sends the link and counts it against the address', async () => {
      const paced = gate({ result: 'admit' })
      const harness = setup(
        [['ada@example.invalid', 'active']],
        false,
        undefined,
        {
          linkEmails: paced.gate,
        },
      )

      await harness.admission.requestLink('ada@example.invalid', {
        client: { ip: client.ip, altcha: 'solved' },
      })

      expect(paced.asked).toEqual([
        { key: 'ada@example.invalid', altcha: 'solved' },
      ])
      expect(paced.released).toEqual([])
      expect(harness.links).toHaveLength(1)
    })

    it('asks for the human check and sends nothing until it is solved', async () => {
      const paced = gate({ result: 'human-check', challenge })
      const harness = setup(
        [['ada@example.invalid', 'active']],
        false,
        undefined,
        {
          linkEmails: paced.gate,
        },
      )

      expect(
        await harness.admission.requestLink('ada@example.invalid', { client }),
      ).toEqual({ state: 'human-check', challenge })
      expect(harness.links).toEqual([])
    })

    it('answers as usual past the ceiling, and sends nothing', async () => {
      const paced = gate({ result: 'try-later' })
      const harness = setup(
        [['ada@example.invalid', 'active']],
        false,
        undefined,
        {
          linkEmails: paced.gate,
        },
      )

      expect(await harness.requestLink('ada@example.invalid')).toBe(
        'check-email',
      )
      expect(harness.links).toEqual([])
    })

    it('admits by invite past the ceiling without sending', async () => {
      const harness = setup([], false, () => ({ result: 'admitted' }), {
        linkEmails: gate({ result: 'try-later' }).gate,
      })

      expect(
        await harness.admission.requestLink('new@example.invalid', {
          client,
          invite: 'tok',
        }),
      ).toEqual({ state: 'check-email' })
      expect(harness.members.get('new@example.invalid')).toBe('active')
      expect(harness.links).toEqual([])
    })
  })

  describe('new applicants, per IP address', () => {
    it('keeps the use of a recorded applicant', async () => {
      const paced = gate({ result: 'admit' })
      const harness = setup([], false, undefined, { applicants: paced.gate })

      await harness.requestLink('new@example.invalid')

      expect(paced.asked).toEqual([{ key: client.ip, altcha: undefined }])
      expect(paced.released).toEqual([])
    })

    it('gives the use back when the applicant could not be recorded', async () => {
      const paced = gate({ result: 'admit' })
      const harness = setup([], true, undefined, { applicants: paced.gate })

      await expect(harness.requestLink('new@example.invalid')).rejects.toThrow()

      expect(paced.released).toEqual([client.ip])
    })

    it('never asks about members or repeat requests', async () => {
      const paced = gate({ result: 'try-later' })
      const harness = setup(
        [
          ['ada@example.invalid', 'active'],
          ['wait@example.invalid', 'applicant'],
          ['no@example.invalid', 'rejected'],
        ],
        false,
        undefined,
        { applicants: paced.gate },
      )

      expect(await harness.requestLink('ada@example.invalid')).toBe(
        'check-email',
      )
      expect(await harness.requestLink('wait@example.invalid')).toBe(
        'access-requested',
      )
      expect(await harness.requestLink('no@example.invalid')).toBe(
        'not-approved',
      )
      expect(paced.asked).toEqual([])
    })

    it('asks for the human check and records nothing until it is solved', async () => {
      const paced = gate({ result: 'human-check', challenge })
      const harness = setup([], false, undefined, { applicants: paced.gate })

      expect(
        await harness.admission.requestLink('new@example.invalid', { client }),
      ).toEqual({ state: 'human-check', challenge })
      expect(harness.members.has('new@example.invalid')).toBe(false)
      expect(harness.notified).toEqual([])
    })

    it('records nothing past the ceiling', async () => {
      const harness = setup([], false, undefined, {
        applicants: gate({ result: 'try-later' }).gate,
      })

      expect(await harness.requestLink('new@example.invalid')).toBe('try-later')
      expect(harness.members.has('new@example.invalid')).toBe(false)
      expect(harness.notified).toEqual([])
    })

    it('paces an applicant whose invite was refused like any other', async () => {
      const harness = setup([], false, undefined, {
        applicants: gate({ result: 'try-later' }).gate,
      })

      expect(
        await harness.admission.requestLink('new@example.invalid', {
          client,
          invite: 'bad',
        }),
      ).toEqual({ state: 'try-later' })
    })
  })
})

describe('createAdmission for an account set to be deleted (ADR 0032)', () => {
  const eraseAfter = new Date('2026-11-04T10:00:00Z')

  it('answers as for any member, and emails its member a link to keep it', async () => {
    const harness = setup(
      [['ada@example.invalid', 'deleted']],
      false,
      undefined,
      {
        ownDeletions: new Map([['ada@example.invalid', eraseAfter]]),
      },
    )

    expect(await harness.requestLink('ada@example.invalid')).toBe('check-email')
    expect(harness.issued).toEqual([{ kind: 'restore', eraseAfter }])
  })

  it("answers the same for a host's deletion, and sends nothing", async () => {
    const harness = setup([['bo@example.invalid', 'deleted']])

    expect(await harness.requestLink('bo@example.invalid')).toBe('check-email')
    expect(harness.links).toEqual([])
    expect(harness.notified).toEqual([])
  })

  it("paces a host's deletion as any member's address, so it shows nothing", async () => {
    const challenge = { parameters: {}, signature: 'sig' } as never
    const asked: string[] = []
    const harness = setup(
      [['bo@example.invalid', 'deleted']],
      false,
      undefined,
      {
        linkEmails: {
          admit: (key) => {
            asked.push(key)
            return Promise.resolve({ result: 'human-check', challenge })
          },
          release: () => undefined,
        },
      },
    )

    expect(
      await harness.admission.requestLink('bo@example.invalid', { client }),
    ).toEqual({ state: 'human-check', challenge })
    expect(asked).toEqual(['bo@example.invalid'])
    expect(harness.links).toEqual([])
  })
})
