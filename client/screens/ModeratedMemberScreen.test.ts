// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModerationItem, ModerationPage } from '../lib/moderation'
import ModeratedMemberScreen from './ModeratedMemberScreen.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { memberId: 'm-rik' } }),
}))

const challenge: ModerationItem = {
  kind: 'challenge',
  id: 'c1',
  body: 'Want to 10x your team? Join my bootcamp.',
  trendShort: 'Rules → Principles',
  sentTo: null,
  state: 'shown',
  hiddenReason: null,
  reports: [
    {
      reason: 'spam',
      comment: 'Not a challenge, an ad.',
      at: '2026-11-08T10:00:00.000Z',
      reporter: 'Priya Raman',
      open: true,
    },
    {
      reason: 'inappropriate',
      comment: null,
      at: '2026-11-08T09:00:00.000Z',
      reporter: null,
      open: true,
    },
  ],
}
const note: ModerationItem = {
  kind: 'note',
  id: 'r1',
  body: 'Use my code REBEL50.',
  trendShort: null,
  sentTo: 'Mara Lindqvist',
  state: 'shown',
  hiddenReason: null,
  reports: [
    {
      reason: 'spam',
      comment: null,
      at: '2026-11-08T08:00:00.000Z',
      reporter: 'Mara Lindqvist',
      open: false,
    },
  ],
}
const page: ModerationPage = {
  member: {
    id: 'm-rik',
    name: 'Rik Dalton',
    email: 'rik@example.invalid',
    org: 'Peakflow',
    status: 'active',
    joinedAt: '2026-11-08T07:00:00.000Z',
  },
  open: { reports: 2, reporters: 2 },
  items: [challenge, note],
  history: [
    {
      kind: 'dismiss',
      actor: 'Sam Host',
      at: '2026-11-08T08:30:00.000Z',
      item: 'note',
      reason: null,
      note: null,
    },
  ],
}

/** Serves `pages` in turn for each read, and answers each change with
 * `status`. */
function server(
  pages: (ModerationPage | null)[],
  status = 204,
): ReturnType<typeof vi.fn> {
  const reads = [...pages]
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Promise.resolve({ ok: status < 300, status })
    const next = reads.length > 1 ? reads.shift() : reads[0]
    return Promise.resolve(
      next === null || next === undefined
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, json: async () => next },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(ModeratedMemberScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

async function click(
  screen: ReturnType<typeof mount>,
  label: string,
  card = 0,
): Promise<void> {
  const button = screen
    .findAll('article')
    [card]?.findAll('button')
    .find((each) => each.text() === label)
  if (button === undefined) throw new Error(`no ${label} button`)
  await button.trigger('click')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ModeratedMemberScreen (S40, R-MOD-7)', () => {
  it('shows each reported item with its reports and who made them', async () => {
    server([page])
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Rik Dalton')
    expect(screen.text()).toContain('2 open reports from 2 different members.')
    const [first, second] = screen.findAll('article')
    expect(first?.text()).toContain('Challenge · Rules → Principles')
    expect(first?.text()).toContain('Spam · Priya Raman')
    expect(first?.text()).toContain('“Not a challenge, an ad.”')
    expect(first?.text()).toContain('Inappropriate · a former member')
    expect(second?.text()).toContain('Note · to Mara Lindqvist')
    expect(second?.text()).toContain('handled')
    expect(screen.text()).toContain(
      'Sam Host dismissed the reports about a note',
    )
  })

  it('offers Hide and Dismiss on a reported challenge, nothing on a handled note', async () => {
    server([page])
    const screen = await mountScreen()

    const [first, second] = screen.findAll('article')
    expect(first?.findAll('button').map((b) => b.text())).toEqual([
      'Hide…',
      'Dismiss',
    ])
    expect(second?.findAll('button')).toHaveLength(0)
  })

  it('hides a challenge with the reason chosen, then reads the page again (R-MOD-8)', async () => {
    const hidden: ModerationPage = {
      ...page,
      items: [{ ...challenge, state: 'hidden', hiddenReason: 'spam' }, note],
    }
    const fetchMock = server([page, hidden])
    const screen = await mountScreen()

    await click(screen, 'Hide…')
    await click(screen, 'Hide')

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/challenges/c1/hide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    })
    expect(screen.text()).toContain('Hidden as spam. Only its author sees it.')
    expect(
      screen
        .findAll('article')[0]
        ?.findAll('button')
        .map((b) => b.text()),
    ).toEqual(['Unhide', 'Dismiss'])
  })

  it('dismisses an item’s reports', async () => {
    const fetchMock = server([page])
    const screen = await mountScreen()

    await click(screen, 'Dismiss')

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/reports/dismiss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: 'c1' }),
    })
  })

  it('says so when another host changed it meanwhile', async () => {
    server([page], 404)
    const screen = await mountScreen()

    await click(screen, 'Dismiss')

    expect(screen.find('[role="alert"]').text()).toContain(
      'Someone changed that meanwhile.',
    )
  })

  it('says there is no such member', async () => {
    server([null])
    const screen = await mountScreen()

    expect(screen.text()).toContain('There is no such member.')
  })
})
