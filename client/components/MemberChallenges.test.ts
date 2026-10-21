// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModeratedChallenge } from '../lib/moderation'
import MemberChallenges from './MemberChallenges.vue'

const shown: ModeratedChallenge = {
  id: 'c1',
  body: 'Buy my bootcamp.',
  trendShort: 'Network of Teams',
  state: 'shown',
  hiddenReason: null,
  createdAt: '2026-10-21T09:00:00.000Z',
}
const hidden: ModeratedChallenge = {
  ...shown,
  id: 'c2',
  body: 'DM me for a free audit.',
  state: 'hidden',
  hiddenReason: 'spam',
}
const withdrawn: ModeratedChallenge = {
  ...shown,
  id: 'c3',
  body: null,
  state: 'withdrawn',
}

/** Serves `lists` in turn for each read, and answers each change with
 * `status`. */
function server(
  lists: ModeratedChallenge[][],
  status = 204,
): ReturnType<typeof vi.fn> {
  const reads = [...lists]
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Promise.resolve({ ok: status < 300, status })
    const challenges = reads.length > 1 ? reads.shift() : reads[0]
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ challenges }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountFor(): Promise<ReturnType<typeof mount>> {
  const screen = mount(MemberChallenges, { props: { memberId: 'm 1' } })
  await flushPromises()
  return screen
}

async function click(
  screen: ReturnType<typeof mount>,
  label: string,
): Promise<void> {
  const button = screen.findAll('button').find((each) => each.text() === label)
  await button?.trigger('click')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MemberChallenges (R-MOD-8, R-MEM-2)', () => {
  it('lists each challenge with its state, a withdrawn one without its text', async () => {
    const fetchMock = server([[shown, hidden, withdrawn]])
    const screen = await mountFor()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/members/m%201/challenges',
    )
    expect(screen.text()).toContain('Buy my bootcamp.')
    expect(screen.text()).toContain('Hidden as spam. Only its author sees it.')
    expect(screen.text()).toContain('Withdrawn by its author')
    expect(screen.findAll('button').map((b) => b.text())).toEqual([
      'Hide…',
      'Unhide',
    ])
  })

  it('hides a challenge with the reason chosen, then reads the list again', async () => {
    const fetchMock = server([
      [shown],
      [{ ...shown, state: 'hidden', hiddenReason: 'inappropriate' }],
    ])
    const screen = await mountFor()

    await click(screen, 'Hide…')
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/hide'),
      expect.anything(),
    )
    await screen.find('input[value="inappropriate"]').setValue(true)
    await click(screen, 'Hide')

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/challenges/c1/hide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'inappropriate' }),
    })
    expect(screen.text()).toContain('Hidden as inappropriate.')
  })

  it('Cancel hides nothing', async () => {
    const fetchMock = server([[shown]])
    const screen = await mountFor()

    await click(screen, 'Hide…')
    await click(screen, 'Cancel')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.text()).toContain('Hide…')
  })

  it('unhides a hidden challenge', async () => {
    const fetchMock = server([
      [hidden],
      [{ ...hidden, state: 'shown', hiddenReason: null }],
    ])
    const screen = await mountFor()

    await click(screen, 'Unhide')

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/challenges/c2/unhide', {
      method: 'POST',
    })
    expect(screen.text()).toContain('Hide…')
  })

  it('says so when someone else changed it meanwhile', async () => {
    server([[hidden]], 404)
    const screen = await mountFor()

    await click(screen, 'Unhide')

    expect(screen.find('[role="alert"]').text()).toContain(
      'Someone changed that meanwhile.',
    )
  })

  it('says so when a change does not go through, keeping the list', async () => {
    server([[shown]], 500)
    const screen = await mountFor()

    await click(screen, 'Hide…')
    await click(screen, 'Hide')

    expect(screen.find('[role="alert"]').text()).toContain('Try again.')
    expect(screen.text()).toContain('Buy my bootcamp.')
  })
})
