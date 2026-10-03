import { describe, expect, it } from 'vitest'
import { createWhitelist, type WhitelistStore } from './whitelist.js'

describe('createWhitelist', () => {
  it('adds each address once, granting the admitted role (R-AUTH-1)', async () => {
    const calls: unknown[] = []
    const store: WhitelistStore = {
      add: (emails, role, grantedBy) => {
        calls.push({ emails, role, grantedBy })
        return Promise.resolve(
          emails.map((email) => ({ email, outcome: 'added' as const })),
        )
      },
    }
    const whitelist = createWhitelist({ store, admittedRole: 'member' })

    const results = await whitelist.add(
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
    expect(results).toHaveLength(2)
  })
})
