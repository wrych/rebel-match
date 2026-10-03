// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApplicantsScreen from './ApplicantsScreen.vue'

const ada = {
  id: 'm-ada',
  email: 'ada@example.invalid',
  requestedAt: '2026-10-03T09:00:00.000Z',
  name: 'Ada Rebel',
  org: 'Rebels',
}

/** Serves the list, then `decisionStatus` for a decision, after which the
 * list is empty. */
function server(decisionStatus = 204): ReturnType<typeof vi.fn> {
  let pending = [ada]
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      pending = []
      return Promise.resolve({
        ok: decisionStatus < 300,
        status: decisionStatus,
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ applicants: pending }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(ApplicantsScreen)
  await flushPromises()
  return screen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ApplicantsScreen', () => {
  it('shows each applicant as the host would recognise them (R-AUTH-11)', async () => {
    server()

    const text = (await mountScreen()).text()

    expect(text).toContain('Ada Rebel')
    expect(text).toContain('Rebels')
    expect(text).toContain('ada@example.invalid')
  })

  it('approves, says the link is on its way, and drops the row (R-AUTH-10)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.findAll('button')[0]!.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/applicants/m-ada/approve',
      { method: 'POST' },
    )
    expect(screen.find('[role="status"]').text()).toContain(
      'link is on its way',
    )
    expect(screen.text()).toContain('Nobody is waiting')
  })

  it('rejects', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.findAll('button')[1]!.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/applicants/m-ada/reject',
      { method: 'POST' },
    )
    expect(screen.find('[role="status"]').text()).toContain('Rejected')
  })

  it.each([
    [502, 'email failed'],
    [404, 'already decided'],
    [500, 'did not go through'],
  ])('tells the host plainly when the answer is %i', async (status, words) => {
    server(status)
    const screen = await mountScreen()

    await screen.findAll('button')[0]!.trigger('click')
    await flushPromises()

    expect(screen.find('[role="status"]').text()).toContain(words)
  })

  it('says so when the list cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    const screen = await mountScreen()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })
})
