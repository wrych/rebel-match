// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportTarget } from '../lib/reports'
import { afterNavigation, thanks } from '../lib/thanks'
import ReportScreen from './ReportScreen.vue'

const route = { name: 'report-challenge', params: { id: 'c 1' } }
const back = vi.fn()
const replace = vi.fn()
const history = { state: { back: '/offer' } as Record<string, unknown> }
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ back, replace, options: { history } }),
}))

const challenge: ReportTarget = {
  kind: 'challenge',
  body: 'Join my paid bootcamp.',
  trendShort: 'Network of Teams',
  alreadyReported: false,
}

/** Serves `target` (404 for null) and the config, and answers the report
 * with `status`. */
function server(
  target: ReportTarget | null,
  status = 204,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Promise.resolve({ ok: status < 300, status })
    if (url === '/api/config')
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ limits: { reportCommentMaxChars: 500 } }),
      })
    return Promise.resolve(
      target === null
        ? { ok: false, status: 404 }
        : { ok: true, status: 200, json: async () => ({ target }) },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(ReportScreen)
  await flushPromises()
  return screen
}

async function chooseAndSend(
  screen: ReturnType<typeof mount>,
  reason = 'spam',
): Promise<void> {
  await screen.find(`input[value="${reason}"]`).setValue(true)
  await screen.find('textarea').setValue('  Selling a course.  ')
  await screen.find('form').trigger('submit')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
  back.mockReset()
  replace.mockReset()
  route.name = 'report-challenge'
  history.state = { back: '/offer' }
  afterNavigation()
  afterNavigation()
})

describe('ReportScreen (S38, R-MOD-3)', () => {
  it('shows what is reported, asks why, and says the author will not learn who', async () => {
    const fetchMock = server(challenge)
    const screen = await mountScreen()

    expect(fetchMock).toHaveBeenCalledWith('/api/reports/challenge/c%201')
    expect(screen.find('h1').text()).toBe('What’s wrong with this challenge?')
    expect(screen.text()).toContain('Join my paid bootcamp.')
    expect(screen.text()).toContain('Inappropriate or offensive')
    expect(screen.text()).toContain('won’t learn who reported it')
    expect(screen.find('button[type="submit"]').attributes()).toHaveProperty(
      'disabled',
    )
  })

  it('reports a note from its own address', async () => {
    route.name = 'report-request'
    const fetchMock = server({ ...challenge, kind: 'note', trendShort: null })
    const screen = await mountScreen()

    expect(fetchMock).toHaveBeenCalledWith('/api/reports/request/c%201')
    expect(screen.find('h1').text()).toBe('What’s wrong with this note?')
  })

  it('sends the reason and comment, then goes back with thanks (R-MOD-4)', async () => {
    const fetchMock = server(challenge)
    const screen = await mountScreen()

    await chooseAndSend(screen, 'inappropriate')

    expect(fetchMock).toHaveBeenCalledWith('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: 'c 1',
        reason: 'inappropriate',
        comment: '  Selling a course.  ',
      }),
    })
    expect(back).toHaveBeenCalledOnce()
    expect(thanks.value).toContain('You won’t see that challenge again.')
  })

  it('goes home when there is nothing to go back to', async () => {
    history.state = { back: null }
    server(challenge)
    const screen = await mountScreen()

    await chooseAndSend(screen)

    expect(back).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/welcome')
  })

  it('says so when the member already reported it, offering no form', async () => {
    server({ ...challenge, alreadyReported: true })
    const screen = await mountScreen()

    expect(screen.text()).toContain('You already reported this.')
    expect(screen.find('form').exists()).toBe(false)
  })

  it('shows a challenge no longer shown without its text, still reportable', async () => {
    server({ ...challenge, body: null })
    const screen = await mountScreen()

    expect(screen.text()).toContain('It is no longer shown')
    expect(screen.find('form').exists()).toBe(true)
  })

  it.each([
    [429, 'Please find a host in person instead.'],
    [404, 'That is no longer there to report.'],
    [500, 'That did not go through. Try again.'],
  ])('stays and says why when the server answers %i', async (status, words) => {
    server(challenge, status)
    const screen = await mountScreen()

    await chooseAndSend(screen)

    expect(back).not.toHaveBeenCalled()
    expect(screen.find('[role="alert"]').text()).toContain(words)
  })

  it('says there is nothing to report where the member may not (R-NAV-8)', async () => {
    server(null)
    const screen = await mountScreen()

    expect(screen.text()).toContain('There is nothing here to report.')
  })
})
