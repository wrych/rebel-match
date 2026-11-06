import { describe, expect, it } from 'vitest'
import type { CardFacts } from './member-search.js'
import {
  createProfileCodes,
  type ProfileCode,
  type ProfileCodeStore,
} from './profile-codes.js'

function memoryStore(): ProfileCodeStore {
  const codes = new Map<string, ProfileCode>()
  return {
    find: (memberId) => Promise.resolve(codes.get(memberId) ?? null),
    create: (memberId, token) => {
      if (!codes.has(memberId)) codes.set(memberId, { token, enabled: true })
      return Promise.resolve(codes.get(memberId) as ProfileCode)
    },
    setEnabled: (memberId, enabled) => {
      const code = codes.get(memberId)
      if (code !== undefined) code.enabled = enabled
      return Promise.resolve(code === undefined ? null : { ...code })
    },
    replaceToken: (memberId, token) => {
      const code = codes.get(memberId)
      if (code !== undefined) code.token = token
      return Promise.resolve(code === undefined ? null : { ...code })
    },
    ownerOf: (token) => {
      const owner = [...codes].find(
        ([, code]) => code.token === token && code.enabled,
      )
      return Promise.resolve(owner?.[0] ?? null)
    },
  }
}

const facts = (memberId: string, reachable = true): CardFacts => ({
  card: {
    memberId,
    name: `Member ${memberId}`,
    jobTitle: null,
    org: null,
    sector: null,
    companySize: null,
  },
  reachable,
  findable: false,
})

function setup(inactive: string[] = []): ReturnType<typeof createProfileCodes> {
  let n = 0
  return createProfileCodes({
    store: memoryStore(),
    cards: {
      card: (memberId) =>
        Promise.resolve(
          memberId === 'm-ghost'
            ? null
            : facts(memberId, !inactive.includes(memberId)),
        ),
    },
    newToken: () => `token-${String(++n)}`,
  })
}

describe('a member’s profile code (R-CODE-2, R-CODE-4)', () => {
  it('is made on first asking, on, and the same after', async () => {
    const codes = setup()

    expect(await codes.mine('m-ada')).toEqual({
      token: 'token-1',
      enabled: true,
    })
    expect(await codes.mine('m-ada')).toEqual({
      token: 'token-1',
      enabled: true,
    })
  })

  it('turns off and on again with the same token', async () => {
    const codes = setup()
    await codes.mine('m-ada')

    expect(await codes.setEnabled('m-ada', false)).toEqual({
      token: 'token-1',
      enabled: false,
    })
    expect(await codes.setEnabled('m-ada', true)).toEqual({
      token: 'token-1',
      enabled: true,
    })
  })

  it('can be turned off before it was ever shown', async () => {
    const codes = setup()

    expect(await codes.setEnabled('m-ada', false)).toMatchObject({
      enabled: false,
    })
  })

  it('resets to a new token at once, the old one not found from then', async () => {
    const codes = setup()
    await codes.mine('m-ada')

    expect(await codes.reset('m-ada')).toEqual({
      token: 'token-2',
      enabled: true,
    })
    expect(await codes.open('m-bob', 'token-1')).toBeNull()
    expect(await codes.open('m-bob', 'token-2')).toMatchObject({
      memberId: 'm-ada',
    })
  })
})

describe('opening a profile code (R-CODE-3)', () => {
  it('shows the owner’s card, findable or not', async () => {
    const codes = setup()
    await codes.mine('m-ada')

    expect(await codes.open('m-bob', 'token-1')).toEqual({
      memberId: 'm-ada',
      card: facts('m-ada').card,
    })
  })

  it.each([
    ['unknown', 'm-bob', 'token-9', []],
    ['the visitor’s own', 'm-ada', 'token-1', []],
    ['an owner no longer active', 'm-bob', 'token-1', ['m-ada']],
  ] as const)(
    'is not found for a code %s',
    async (_what, visitor, token, inactive) => {
      const codes = setup([...inactive])
      await codes.mine('m-ada')

      expect(await codes.open(visitor, token)).toBeNull()
    },
  )

  it('is not found while the code is off', async () => {
    const codes = setup()
    await codes.mine('m-ada')
    await codes.setEnabled('m-ada', false)

    expect(await codes.open('m-bob', 'token-1')).toBeNull()
  })
})
