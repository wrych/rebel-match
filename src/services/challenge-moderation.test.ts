import { describe, expect, it } from 'vitest'
import {
  createChallengeModeration,
  type ChallengeModerationStore,
} from './challenge-moderation.js'

function setup(): {
  moderation: ReturnType<typeof createChallengeModeration>
  hidden: Set<string>
} {
  const hidden = new Set<string>()
  const store: ChallengeModerationStore = {
    ofMember: () => Promise.resolve([]),
    hide: (id) =>
      Promise.resolve(
        id.startsWith('c-') && !hidden.has(id) && !!hidden.add(id),
      ),
    unhide: (id) => Promise.resolve(hidden.delete(id)),
  }
  return { moderation: createChallengeModeration(store), hidden }
}

describe('createChallengeModeration (R-MOD-8)', () => {
  it('hides a challenge once, and is not found for one already hidden', async () => {
    const { moderation } = setup()

    expect(await moderation.hide('c-1', 'm-host', 'spam')).toBe('hidden')
    expect(await moderation.hide('c-1', 'm-host', 'spam')).toBe('not_found')
    expect(await moderation.hide('x-9', 'm-host', 'other')).toBe('not_found')
  })

  it('shows a hidden challenge again, and is not found for one shown', async () => {
    const { moderation } = setup()
    await moderation.hide('c-1', 'm-host', 'inappropriate')

    expect(await moderation.unhide('c-1', 'm-host')).toBe('shown')
    expect(await moderation.unhide('c-1', 'm-host')).toBe('not_found')
  })
})
