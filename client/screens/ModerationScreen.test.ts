// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportedMember } from '../lib/moderation'
import ModerationScreen from './ModerationScreen.vue'

const route = reactive({ query: {} as Record<string, string> })
const replace = vi.fn((to: { query: Record<string, string> }) => {
  route.query = to.query
  return Promise.resolve()
})
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

const rik: ReportedMember = {
  memberId: 'm-rik',
  name: 'Rik Dalton',
  email: 'rik@example.invalid',
  org: 'Peakflow',
  status: 'active',
  reports: 4,
  reporters: 4,
  challenges: 1,
  notes: 1,
  reasons: [
    { reason: 'spam', count: 3 },
    { reason: 'inappropriate', count: 1 },
  ],
  latestAt: '2026-11-08T10:00:00.000Z',
}
const ines: ReportedMember = {
  ...rik,
  memberId: 'm-ines',
  name: 'Ines Kovač',
  org: null,
  reports: 3,
  reporters: 1,
  challenges: 3,
  notes: 0,
  reasons: [{ reason: 'other', count: 3 }],
}

/** Serves the open and handled lists and the config. */
function server(
  open: ReportedMember[],
  handled: ReportedMember[] = [],
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    const body =
      url === '/api/config'
        ? { limits: { reportersToFlag: 3, moderationPollSeconds: 30 } }
        : { members: url.endsWith('handled') ? handled : open }
    return Promise.resolve({ ok: true, status: 200, json: async () => body })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(ModerationScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
  route.query = {}
  replace.mockClear()
})

describe('ModerationScreen (S39, R-MOD-6)', () => {
  it('shows one card per reported member: reports, reporters, items, reasons', async () => {
    server([rik, ines])
    const screen = await mountScreen()

    const cards = screen.findAll('.reported-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('Rik Dalton')
    expect(cards[0]?.text()).toContain('4 reports from 4 members')
    expect(cards[0]?.text()).toContain('1 challenge · 1 note')
    expect(cards[0]?.text()).toContain('Spam ×3')
    expect(cards[0]?.text()).toContain('Inappropriate ×1')
    expect(cards[1]?.text()).toContain('3 reports from 1 member')
    expect(
      screen
        .findAllComponents(RouterLinkStub)
        .map((link) => link.props('to') as unknown),
    ).toEqual(['/admin/moderation/m-rik', '/admin/moderation/m-ines'])
  })

  it('outlines a member reported by enough different members', async () => {
    server([rik, ines])
    const screen = await mountScreen()

    const cards = screen.findAll('.reported-card')
    expect(cards.map((card) => card.classes('flagged'))).toEqual([true, false])
  })

  it('shows the handled tab from its own address, outlining nothing', async () => {
    const fetchMock = server([ines], [rik])
    const screen = await mountScreen()

    const handled = screen
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === 'Handled')
    await handled?.trigger('click')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ query: { state: 'handled' } })
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/reports?state=handled')
    expect(screen.text()).toContain('Rik Dalton')
    expect(screen.text()).not.toContain('Ines Kovač')
    expect(screen.find('.flagged').exists()).toBe(false)
    expect(screen.find('.card-new').exists()).toBe(false)
  })

  it('says so when nothing waits for a host', async () => {
    server([])
    const screen = await mountScreen()

    expect(screen.text()).toContain('Nothing waits for a host.')
  })
})
