import { describe, expect, it } from 'vitest'
import {
  admissionFor,
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

interface Harness {
  requestLink: (email: string, next?: string) => Promise<string>
  links: { email: string; next: string | undefined }[]
  notified: string[]
  members: Map<string, MemberStatus>
}

function setup(
  initial: [string, MemberStatus][] = [],
  noticeFails = false,
): Harness {
  const members = new Map(initial)
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
  }
  const admission = createAdmission({
    store,
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
    requestLink: (email, next) => admission.requestLink(email, next),
    links,
    notified,
    members,
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
})
