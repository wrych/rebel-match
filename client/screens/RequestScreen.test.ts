// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionView } from '../lib/connections'
import RequestScreen from './RequestScreen.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'r1' } }),
  useRouter: () => ({ push }),
}))

const incoming: ConnectionView = {
  id: 'r1',
  direction: 'incoming',
  kind: 'same_boat',
  status: 'pending',
  message: 'Shall we compare notes?',
  noteReported: false,
  noteHiddenAs: null,
  createdAt: '2026-10-03T09:00:00.000Z',
  other: {
    memberId: 'm2',
    name: 'Sam Boat',
    jobTitle: 'Lead',
    org: 'Acme',
    sector: null,
    companySize: null,
  },
  challenge: {
    id: 'c1',
    body: 'Nobody knows who can decide what.',
    trendShort: 'Network of Teams',
    withdrawn: false,
    hidden: false,
  },
  unseen: false,
}

/** Serves `views` in turn for each read, and answers with `status`. */
function server(
  views: (ConnectionView | null)[],
  status = 204,
): ReturnType<typeof vi.fn> {
  const reads = [...views]
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Promise.resolve({ ok: status < 300, status })
    const view = reads.length > 1 ? reads.shift() : reads[0]
    return Promise.resolve(
      view === null || view === undefined
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, json: async () => ({ request: view }) },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(RequestScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
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
  push.mockReset()
})

describe('RequestScreen', () => {
  it('shows who wants to connect, their note and the challenge (R-CONN-2)', async () => {
    server([incoming])
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('Sam Boat wants to connect')
    expect(screen.text()).toContain('Lead · Acme')
    expect(screen.text()).toContain('Shall we compare notes?')
    expect(screen.text()).toContain('About Network of Teams')
    expect(screen.text()).toContain('Nobody knows who can decide what.')
    expect(screen.html()).not.toContain('@')
  })

  it('offers to report the note sent to the member, and only that (R-MOD-2)', async () => {
    server([incoming])
    const incomingScreen = await mountScreen()
    server([{ ...incoming, direction: 'outgoing' }])
    const outgoingScreen = await mountScreen()
    const reportLinks = (screen: ReturnType<typeof mount>): unknown[] =>
      screen
        .findAllComponents(RouterLinkStub)
        .filter((link) => link.text() === 'Report this note')
        .map((link) => link.props('to') as unknown)

    expect(reportLinks(incomingScreen)).toEqual(['/report/request/r1'])
    expect(reportLinks(outgoingScreen)).toEqual([])
  })

  it('says the member reported the note, in place of it (R-MOD-4)', async () => {
    server([
      { ...incoming, status: 'accepted', message: null, noteReported: true },
    ])
    const screen = await mountScreen()

    expect(screen.text()).toContain('You reported their note.')
    expect(screen.text()).not.toContain('Report this note')
  })

  it('shows a withdrawn challenge without its text (R-ASK-17)', async () => {
    server([
      {
        ...incoming,
        challenge: {
          id: 'c1',
          body: null,
          trendShort: 'Network of Teams',
          withdrawn: true,
          hidden: false,
        },
      },
    ])
    const screen = await mountScreen()

    expect(screen.text()).toContain('About Network of Teams')
    expect(screen.text()).toContain('A withdrawn challenge')
    expect(screen.text()).not.toContain('Nobody knows who can decide what.')
  })

  it('shows a challenge a host hid without its text (R-MOD-8)', async () => {
    server([
      {
        ...incoming,
        challenge: {
          id: 'c1',
          body: null,
          trendShort: 'Network of Teams',
          withdrawn: false,
          hidden: true,
        },
      },
    ])
    const screen = await mountScreen()

    expect(screen.text()).toContain('A challenge a host removed')
    expect(screen.text()).not.toContain('Nobody knows who can decide what.')
  })

  it('shows the recipient a note a host hid as removed, without it (R-MOD-8)', async () => {
    server([{ ...incoming, message: null, noteHiddenAs: 'spam' }])
    const screen = await mountScreen()

    expect(screen.text()).toContain('Their note was removed by a host.')
    expect(screen.text()).not.toContain('Report this note')
  })

  it('shows the sender their hidden note, and why (R-MOD-8)', async () => {
    server([{ ...incoming, direction: 'outgoing', noteHiddenAs: 'spam' }])
    const screen = await mountScreen()

    expect(screen.text()).toContain('Shall we compare notes?')
    expect(screen.text()).toContain('A host hid your note as spam')
  })

  it('accepts, then shows the contact (R-CONN-3)', async () => {
    const fetchMock = server([incoming])
    await click(await mountScreen(), 'Accept')

    expect(fetchMock).toHaveBeenCalledWith('/api/connections/r1/accept', {
      method: 'POST',
    })
    expect(push).toHaveBeenCalledWith('/matches/requests/r1/contact')
  })

  it('declines and shows the request closed (R-CONN-4)', async () => {
    const fetchMock = server([incoming])
    const screen = await mountScreen()
    await click(screen, 'Decline')

    expect(fetchMock).toHaveBeenCalledWith('/api/connections/r1/decline', {
      method: 'POST',
    })
    expect(screen.text()).toContain('This request is closed.')
    expect(push).not.toHaveBeenCalled()
  })

  it('says so when the request stopped waiting meanwhile', async () => {
    server([incoming, { ...incoming, status: 'declined' }], 404)
    const screen = await mountScreen()
    await click(screen, 'Accept')

    expect(screen.find('[role="alert"]').text()).toContain('no longer waiting')
    expect(push).not.toHaveBeenCalled()
  })

  it('stops offering an answer when the re-read after a refusal fails', async () => {
    const fetchMock = server([incoming], 404)
    const screen = await mountScreen()
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST'
          ? { ok: false, status: 404 }
          : { ok: false, status: 500 },
      ),
    )
    await click(screen, 'Accept')

    expect(screen.find('[role="alert"]').text()).toContain('no longer waiting')
    expect(screen.findAll('button')).toHaveLength(0)
  })

  it('says so when the answer did not save', async () => {
    server([incoming], 500)
    const screen = await mountScreen()
    await click(screen, 'Accept')

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
  })

  it('offers no answer on a request the member sent', async () => {
    server([{ ...incoming, direction: 'outgoing' }])
    const screen = await mountScreen()

    expect(screen.find('h1').text()).toBe('You asked Sam Boat')
    expect(screen.text()).toContain('Waiting for Sam Boat to answer.')
    expect(screen.findAll('button')).toHaveLength(0)
  })

  it('links an accepted request to the contact', async () => {
    server([{ ...incoming, status: 'accepted' }])
    const screen = await mountScreen()

    expect(screen.text()).toContain('You are connected.')
    expect(
      screen
        .findAllComponents(RouterLinkStub)
        .map((link) => link.props('to') as unknown),
    ).toContain('/matches/requests/r1/contact')
  })

  it('shows nothing of a request that is not theirs (R-NAV-8)', async () => {
    server([null])

    expect((await mountScreen()).find('.empty').text()).toContain(
      'no request of yours',
    )
  })

  it('says so when the request cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    expect((await mountScreen()).find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
