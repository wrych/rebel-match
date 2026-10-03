import { describe, expect, it } from 'vitest'
import { createApplicantHandles } from './applicant-handle.js'
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
    ['deleted', 'already-asked'],
  ] as const)('treats %s as %s (R-AUTH-1,2,4)', (status, admission) => {
    expect(admissionFor(status)).toBe(admission)
  })
})

const handles = createApplicantHandles('x'.repeat(32))

interface Harness {
  requestLink: (email: string, next?: string) => Promise<string>
  admission: ReturnType<typeof createAdmission>
  links: { email: string; next: string | undefined }[]
  notified: string[]
  members: Map<string, MemberStatus>
  details: Map<string, ApplicantDetails>
}

function setup(
  initial: [string, MemberStatus][] = [],
  noticeFails = false,
): Harness {
  const members = new Map(initial)
  const details = new Map<string, ApplicantDetails>()
  const links: Harness['links'] = []
  const notified: string[] = []
  const store: AdmissionStore = {
    statusByEmail: (email) => Promise.resolve(members.get(email) ?? null),
    createApplicant: (email) => {
      if (members.has(email)) return Promise.resolve(false)
      members.set(email, 'applicant')
      return Promise.resolve(true)
    },
    removeApplicant: (email) => {
      if (members.get(email) === 'applicant') members.delete(email)
      return Promise.resolve()
    },
    describeApplicant: (email, given) => {
      if (members.get(email) !== 'applicant') return Promise.resolve(false)
      details.set(email, { ...details.get(email), ...given })
      return Promise.resolve(true)
    },
  }
  const admission = createAdmission({
    store,
    handles,
    auth: {
      issueLink: (email, opts) => {
        links.push({ email, next: opts.next })
        return Promise.resolve()
      },
    },
    notifyReviewers: (email) => {
      if (noticeFails) return Promise.reject(new Error('outbox unavailable'))
      notified.push(email)
      return Promise.resolve()
    },
  })
  return {
    requestLink: async (email, next) =>
      (await admission.requestLink(email, { next })).state,
    admission,
    links,
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

  it('takes the applicant back when nobody could be told, so a retry notifies', async () => {
    const harness = setup([], true)

    await expect(harness.requestLink('new@example.invalid')).rejects.toThrow(
      'outbox unavailable',
    )

    expect(harness.members.has('new@example.invalid')).toBe(false)
  })

  it('hands an applicant the handle for their own address (R-AUTH-11)', async () => {
    const harness = setup()

    const answer = await harness.admission.requestLink('new@example.invalid')

    expect(answer.handle).toBeDefined()
    expect(handles.read(String(answer.handle))).toBe('new@example.invalid')
  })

  it('hands no handle to a repeat request, which anyone can make', async () => {
    const harness = setup([['new@example.invalid', 'applicant']])

    expect(await harness.admission.requestLink('new@example.invalid')).toEqual({
      state: 'access-requested',
    })
  })

  it('hands no handle with a link or a refusal', async () => {
    const harness = setup([
      ['ada@example.invalid', 'active'],
      ['no@example.invalid', 'rejected'],
    ])

    for (const email of ['ada@example.invalid', 'no@example.invalid']) {
      expect(await harness.admission.requestLink(email)).not.toHaveProperty(
        'handle',
      )
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
