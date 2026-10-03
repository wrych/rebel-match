import { describe, expect, it } from 'vitest'
import {
  createWhitelist,
  type StoredResult,
  type WhitelistStore,
} from './whitelist.js'

interface Sent {
  email: string
  kind: string
}

function setup(
  stored: StoredResult[],
  failFor: string[] = [],
): {
  whitelist: ReturnType<typeof createWhitelist>
  calls: unknown[]
  sent: Sent[]
} {
  const calls: unknown[] = []
  const sent: Sent[] = []
  const store: WhitelistStore = {
    add: (emails, role, grantedBy) => {
      calls.push({ emails, role, grantedBy })
      return Promise.resolve(stored)
    },
  }
  const whitelist = createWhitelist({
    store,
    admittedRole: 'member',
    auth: {
      issueLink: (email, { kind }) => {
        if (failFor.includes(email))
          return Promise.reject(new Error('smtp down'))
        sent.push({ email, kind })
        return Promise.resolve()
      },
    },
  })
  return { whitelist, calls, sent }
}

describe('createWhitelist', () => {
  it('adds each address once, granting the admitted role (R-AUTH-1)', async () => {
    const { whitelist, calls } = setup([])

    await whitelist.add(
      ['a@example.invalid', 'b@example.invalid', 'a@example.invalid'],
      'm-admin',
    )

    expect(calls).toEqual([
      {
        emails: ['a@example.invalid', 'b@example.invalid'],
        role: 'member',
        grantedBy: 'm-admin',
      },
    ])
  })

  it('emails an admitted applicant their approval link, and nobody else (R-AUTH-3, R-AUTH-10)', async () => {
    const { whitelist, sent } = setup([
      { email: 'new@example.invalid', outcome: 'added' },
      { email: 'waiting@example.invalid', outcome: 'admitted' },
      { email: 'member@example.invalid', outcome: 'already_active' },
      { email: 'rejected@example.invalid', outcome: 'kept_out' },
    ])

    const results = await whitelist.add([], 'm-admin')

    expect(sent).toEqual([
      { email: 'waiting@example.invalid', kind: 'approval' },
    ])
    expect(results.map((r) => r.outcome)).toEqual([
      'added',
      'admitted',
      'already_active',
      'kept_out',
    ])
  })

  it('reports link_failed when the email fails, and still emails the rest', async () => {
    const { whitelist, sent } = setup(
      [
        { email: 'a@example.invalid', outcome: 'admitted' },
        { email: 'b@example.invalid', outcome: 'admitted' },
      ],
      ['a@example.invalid'],
    )

    const results = await whitelist.add([], 'm-admin')

    expect(results).toEqual([
      { email: 'a@example.invalid', outcome: 'link_failed' },
      { email: 'b@example.invalid', outcome: 'admitted' },
    ])
    expect(sent).toEqual([{ email: 'b@example.invalid', kind: 'approval' }])
  })
})
