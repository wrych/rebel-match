// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Cockpit } from '../lib/cockpit'
import type { ConnectionView } from '../lib/connections'
import CockpitScreen from './CockpitScreen.vue'

const cockpit: Cockpit = {
  challenges: [
    {
      id: 'c1',
      body: 'Nobody knows who can decide what.',
      trend: { id: '02', short: 'Network of Teams' },
      counts: { sameBoat: 2, beenThere: 3, cases: 1 },
    },
  ],
  following: [
    { id: '05', short: 'Radical Transparency', from: 'Secrecy', peers: 4 },
  ],
  pendingIncoming: 1,
}

const request: ConnectionView = {
  id: 'r1',
  direction: 'incoming',
  kind: 'been_there',
  status: 'pending',
  message: 'We ran into exactly this.',
  createdAt: '2026-10-03T09:00:00.000Z',
  other: {
    memberId: 'm2',
    name: 'Bea There',
    jobTitle: null,
    org: null,
    sector: null,
    companySize: null,
  },
  challenge: null,
}

function serve(mine: Cockpit, waiting: ConnectionView[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          url === '/api/cockpit' ? mine : { requests: waiting },
      }),
    ),
  )
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(CockpitScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return screen
}

function paths(screen: ReturnType<typeof mount>): unknown[] {
  return screen
    .findAllComponents(RouterLinkStub)
    .map((link) => link.props('to') as unknown)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CockpitScreen', () => {
  it('lists requests waiting for the member, each opening its screen (R-MINE-2)', async () => {
    serve(cockpit, [request])
    const screen = await mountScreen()

    expect(screen.text()).toContain('Bea There')
    expect(screen.text()).toContain('Been there')
    expect(screen.text()).toContain('We ran into exactly this.')
    expect(paths(screen)).toContain('/matches/requests/r1')
  })

  it('shows each challenge with its counts and reopens its matches (R-MINE-1)', async () => {
    serve(cockpit, [])
    const screen = await mountScreen()

    expect(screen.text()).toContain('Nobody knows who can decide what.')
    expect(screen.text()).toContain('Network of Teams')
    expect(screen.find('.counts').text()).toBe(
      '2 same boat · 3 been there · 1 case studies',
    )
    expect(paths(screen)).toContain('/challenges/c1/matches')
  })

  it('shows the trends the member follows, each opening its screen (R-MINE-3)', async () => {
    serve(cockpit, [])
    const screen = await mountScreen()

    expect(screen.find('.follow-list').text()).toBe('Radical Transparency')
    expect(paths(screen)).toContain('/trends/05')
  })

  it('says what is empty, and offers to ask when there is no challenge', async () => {
    serve({ challenges: [], following: [], pendingIncoming: 0 }, [])
    const screen = await mountScreen()

    expect(screen.findAll('.empty').map((each) => each.text())).toEqual([
      'No requests waiting.',
      'You have not asked for help yet.',
      'You follow no trends yet.',
    ])
    expect(paths(screen)).toEqual(['/ask'])
  })

  it('says so when the cockpit cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    expect((await mountScreen()).find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
