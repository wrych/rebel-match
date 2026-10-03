import { describe, expect, it } from 'vitest'
import {
  createApprovals,
  type ApprovalStore,
  type PendingApplicant,
} from './approvals.js'

const ada: PendingApplicant = {
  id: 'm-ada',
  email: 'ada@example.invalid',
  requestedAt: '2026-10-03T09:00:00.000Z',
  name: 'Ada',
  org: null,
}

function setup(linkFails = false): {
  approvals: ReturnType<typeof createApprovals>
  pending: Map<string, PendingApplicant>
  admitted: { id: string; role: string; by: string }[]
  rejected: string[]
  links: { email: string; kind: string }[]
} {
  const pending = new Map([[ada.id, ada]])
  const admitted: { id: string; role: string; by: string }[] = []
  const rejected: string[] = []
  const links: { email: string; kind: string }[] = []
  const store: ApprovalStore = {
    listPending: () => Promise.resolve([...pending.values()]),
    approve: (id, role, by) => {
      const applicant = pending.get(id)
      if (applicant === undefined) return Promise.resolve(null)
      pending.delete(id)
      admitted.push({ id, role, by })
      return Promise.resolve(applicant.email)
    },
    reject: (id) => {
      if (!pending.delete(id)) return Promise.resolve(false)
      rejected.push(id)
      return Promise.resolve(true)
    },
  }
  const approvals = createApprovals({
    store,
    admittedRole: 'member',
    auth: {
      issueLink: (email, opts) => {
        if (linkFails) return Promise.reject(new Error('smtp down'))
        links.push({ email, kind: opts.kind })
        return Promise.resolve()
      },
    },
  })
  return { approvals, pending, admitted, rejected, links }
}

describe('createApprovals', () => {
  it('lists pending applicants with what the host needs (R-AUTH-11)', async () => {
    expect(await setup().approvals.listPending()).toEqual([ada])
  })

  it('admits with the member role and emails an approval link (R-AUTH-3,10)', async () => {
    const harness = setup()

    expect(await harness.approvals.approve('m-ada', 'm-host')).toBe('approved')
    expect(harness.admitted).toEqual([
      { id: 'm-ada', role: 'member', by: 'm-host' },
    ])
    expect(harness.links).toEqual([
      { email: 'ada@example.invalid', kind: 'approval' },
    ])
  })

  it('approves nobody twice, sending one link', async () => {
    const harness = setup()

    await harness.approvals.approve('m-ada', 'm-host')
    expect(await harness.approvals.approve('m-ada', 'm-host')).toBe(
      'not_pending',
    )
    expect(harness.links).toHaveLength(1)
  })

  it('says so when the link could not be sent, keeping them admitted', async () => {
    const harness = setup(true)

    expect(await harness.approvals.approve('m-ada', 'm-host')).toBe(
      'link_failed',
    )
    expect(harness.admitted).toHaveLength(1)
  })

  it('rejects a pending applicant, sending nothing (R-AUTH-3)', async () => {
    const harness = setup()

    expect(await harness.approvals.reject('m-ada')).toBe('rejected')
    expect(await harness.approvals.reject('m-ada')).toBe('not_pending')
    expect(harness.links).toEqual([])
  })
})
