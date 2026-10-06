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
  newConnections: 0,
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
  unseen: false,
}

const config = { limits: { matchesPollSeconds: 30 } }

function serve(
  mine: Cockpit,
  waiting: () => ConnectionView[],
  people: () => ConnectionView[] = () => [],
): void {
  const bodies: Record<string, () => unknown> = {
    '/api/config': () => config,
    '/api/cockpit': () => mine,
    '/api/connections/incoming': () => ({ requests: waiting() }),
    '/api/connections/connected': () => ({ connections: people() }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => bodies[url]?.(),
      }),
    ),
  )
}

function answerWith(status: number): void {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: status < 400,
    status,
  } as Response)
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
  it('records the visit before reading, so the badge clears (R-MINE-4)', async () => {
    serve(cockpit, () => [request])
    await mountScreen()

    const calls = vi
      .mocked(fetch)
      .mock.calls.map(([url, init]) =>
        [String(url), init?.method ?? 'GET'].join(' '),
      )
    const marked = calls.indexOf('/api/matches/seen POST')
    expect(marked).toBeGreaterThanOrEqual(0)
    expect(marked).toBeLessThan(calls.indexOf('/api/connections/incoming GET'))
  })

  it('still lists what waits when the visit cannot be recorded (R-MINE-4)', async () => {
    serve(cockpit, () => [request])
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const screen = await mountScreen()

    expect(screen.text()).toContain('Bea There')
  })

  it('lists requests waiting for the member, each opening its screen (R-MINE-2)', async () => {
    serve(cockpit, () => [request])
    const screen = await mountScreen()

    expect(screen.text()).toContain('Bea There')
    expect(screen.text()).toContain('Been there')
    expect(screen.text()).toContain('We ran into exactly this.')
    expect(paths(screen)).toContain('/matches/requests/r1')
  })

  it('accepts a request from the list, which then shows as a connection (R-MINE-2)', async () => {
    let waiting = [request]
    let people: ConnectionView[] = []
    serve(
      cockpit,
      () => waiting,
      () => people,
    )
    const screen = await mountScreen()
    answerWith(204)
    waiting = []
    people = [{ ...request, status: 'accepted' }]

    await screen.get('[aria-label="Accept Bea There"]').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith('/api/connections/r1/accept', {
      method: 'POST',
    })
    expect(screen.get('[role="status"]').text()).toBe(
      'You are connected with Bea There.',
    )
    expect(screen.text()).toContain('No requests waiting.')
    expect(paths(screen)).toContain('/matches/requests/r1/contact')
  })

  it('declines a request from the list, sharing nothing (R-MINE-2)', async () => {
    let waiting = [request]
    serve(cockpit, () => waiting)
    const screen = await mountScreen()
    answerWith(204)
    waiting = []

    await screen.get('[aria-label="Decline Bea There"]').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith('/api/connections/r1/decline', {
      method: 'POST',
    })
    expect(screen.get('[role="status"]').text()).toBe(
      'You declined Bea There. Nothing was shared.',
    )
    expect(paths(screen)).not.toContain('/matches/requests/r1')
  })

  it('says so when a request stopped waiting before the answer', async () => {
    serve(cockpit, () => [request])
    const screen = await mountScreen()
    answerWith(404)

    await screen.get('[aria-label="Accept Bea There"]').trigger('click')
    await flushPromises()

    expect(screen.get('[role="status"]').text()).toBe(
      'That request is no longer waiting for you.',
    )
  })

  it('keeps the request, and says so, when an answer does not save', async () => {
    serve(cockpit, () => [request])
    const screen = await mountScreen()
    answerWith(500)

    await screen.get('[aria-label="Accept Bea There"]').trigger('click')
    await flushPromises()

    expect(screen.get('[role="alert"]').text()).toBe(
      'That did not save. Try again.',
    )
    expect(paths(screen)).toContain('/matches/requests/r1')
  })

  it('lists connections made on either side, each opening its contact (R-MINE-5)', async () => {
    const connection: ConnectionView = {
      ...request,
      id: 'r7',
      direction: 'outgoing',
      status: 'accepted',
      other: {
        ...request.other,
        name: 'Cas Nected',
        jobTitle: 'Coach',
        org: 'Acme',
      },
    }
    serve(
      cockpit,
      () => [],
      () => [connection],
    )
    const screen = await mountScreen()

    expect(screen.text()).toContain('Your connections')
    expect(screen.text()).toContain('Cas Nected')
    expect(screen.text()).toContain('Coach · Acme')
    expect(paths(screen)).toContain('/matches/requests/r7/contact')
  })

  it('lists each member once, those with something unopened first, outlined and counted (R-MINE-5,6)', async () => {
    const accepted: ConnectionView = {
      ...request,
      direction: 'outgoing',
      status: 'accepted',
    }
    const pal = { ...request.other, memberId: 'm3', name: 'Old Pal' }
    serve(
      cockpit,
      () => [],
      () => [
        { ...accepted, id: 'r10', other: pal },
        { ...accepted, id: 'r9', unseen: true },
        { ...accepted, id: 'r8', unseen: true },
        { ...accepted, id: 'r7' },
      ],
    )
    const screen = await mountScreen()

    const rows = screen
      .findAllComponents(RouterLinkStub)
      .filter((link) => String(link.props('to')).endsWith('/contact'))
    expect(rows.map((row) => row.props('to'))).toEqual([
      '/matches/requests/r9/contact',
      '/matches/requests/r10/contact',
    ])
    expect(rows.map((row) => row.classes('card-new'))).toEqual([true, false])
    expect(rows[0]?.find('.badge').text()).toBe('2')
    expect(rows[0]?.attributes('aria-label')).toBe('Bea There, 2 new')
    expect(rows[1]?.find('.badge').exists()).toBe(false)
  })

  it('shows a new request without a reload (R-MINE-4)', async () => {
    vi.useFakeTimers()
    let waiting: ConnectionView[] = []
    serve(cockpit, () => waiting)
    const screen = await mountScreen()
    expect(screen.text()).toContain('No requests waiting.')

    waiting = [request]
    await vi.advanceTimersByTimeAsync(30_000)
    await flushPromises()

    expect(screen.text()).toContain('Bea There')
    screen.unmount()
    vi.useRealTimers()
  })

  it('shows a connection accepted on the other side without a reload (R-MINE-5)', async () => {
    vi.useFakeTimers()
    let people: ConnectionView[] = []
    serve(
      cockpit,
      () => [],
      () => people,
    )
    const screen = await mountScreen()

    people = [{ ...request, status: 'accepted', direction: 'outgoing' }]
    await vi.advanceTimersByTimeAsync(30_000)
    await flushPromises()

    expect(paths(screen)).toContain('/matches/requests/r1/contact')
    screen.unmount()
    vi.useRealTimers()
  })

  it('starts no timer when left before it loaded', async () => {
    vi.useFakeTimers()
    serve(cockpit, () => [])
    const screen = mount(CockpitScreen, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    screen.unmount()
    await flushPromises()
    vi.mocked(fetch).mockClear()

    await vi.advanceTimersByTimeAsync(90_000)

    expect(fetch).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('shows each challenge with its counts and reopens its matches (R-MINE-1)', async () => {
    serve(cockpit, () => [])
    const screen = await mountScreen()

    expect(screen.text()).toContain('Nobody knows who can decide what.')
    expect(screen.text()).toContain('Network of Teams')
    expect(screen.find('.counts').text()).toBe(
      '2 same boat · 3 been there · 1 case studies',
    )
    expect(paths(screen)).toContain('/challenges/c1/matches')
  })

  it('shows the trends the member follows, each opening its screen (R-MINE-3)', async () => {
    serve(cockpit, () => [])
    const screen = await mountScreen()

    expect(screen.find('.follow-list').text()).toBe('Radical Transparency')
    expect(paths(screen)).toContain('/trends/05')
  })

  it('says what is empty, and offers to ask when there is no challenge', async () => {
    serve(
      { challenges: [], following: [], pendingIncoming: 0, newConnections: 0 },
      () => [],
    )
    const screen = await mountScreen()

    expect(screen.findAll('.empty').map((each) => each.text())).toEqual([
      'No requests waiting.',
      'No connections yet. They show here once a request is accepted.',
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
