// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AskScreen from './AskScreen.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const minChars = 31
const maxChars = 500
const longEnough = 'Nobody here knows who can decide what.'

const newest = [
  {
    body: 'Peer feedback instead of annual reviews.',
    trend: { id: '07', short: 'Inner Motivation' },
  },
  {
    body: 'A shadow organisation beside the official one.',
    trend: { id: '02', short: 'Network of Teams' },
  },
]

/** Serves the config and the newest challenges, or fails to when `latest` is
 * null, and answers the submission with `status`. */
function server(
  status = 201,
  latest: object[] | null = newest,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Promise.resolve({
        ok: status < 300,
        status,
        json: async () => ({ challenge: { id: 'c 1' } }),
      })
    if (url === '/api/challenges/newest')
      return Promise.resolve({
        ok: latest !== null,
        status: latest === null ? 500 : 200,
        json: async () => ({ challenges: latest }),
      })
    return Promise.resolve({
      ok: url === '/api/config',
      status: 200,
      json: async () => ({
        limits: { challengeMinChars: minChars, challengeMaxChars: maxChars },
      }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountScreen(): Promise<ReturnType<typeof mount>> {
  const screen = mount(AskScreen)
  await flushPromises()
  return screen
}

function submitButton(screen: ReturnType<typeof mount>): HTMLButtonElement {
  return screen.find('button[type="submit"]').element as HTMLButtonElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
})

describe('AskScreen', () => {
  it('asks for one challenge in their own words (R-ASK-1)', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('textarea#challenge').exists()).toBe(true)
    expect(screen.text()).toContain('what do you observe')
  })

  it('keeps Submit disabled at 30 characters and counts them (R-ASK-3)', async () => {
    server()
    const screen = await mountScreen()

    await screen.find('textarea').setValue(`  ${'x'.repeat(minChars - 1)}  `)

    expect(submitButton(screen).disabled).toBe(true)
    expect(screen.find('#challenge-count').text()).toContain(
      `${String(minChars - 1)} characters`,
    )
    expect(screen.find('#challenge-count').text()).toContain(
      `${String(minChars)} to ${String(maxChars)}`,
    )
  })

  it('takes no more than the configured maximum (R-ASK-3, R-CFG-2)', async () => {
    server()
    const screen = await mountScreen()
    const field = screen.find('textarea')

    expect(field.attributes('maxlength')).toBe(String(maxChars))
    await field.setValue('x'.repeat(maxChars))
    expect(submitButton(screen).disabled).toBe(false)
    await field.setValue('x'.repeat(maxChars + 1))
    expect(submitButton(screen).disabled).toBe(true)
  })

  it('enables Submit from the configured minimum (R-ASK-3, R-CFG-2)', async () => {
    server()
    const screen = await mountScreen()

    await screen.find('textarea').setValue('x'.repeat(minChars))

    expect(submitButton(screen).disabled).toBe(false)
  })

  it('shows the newest challenges as inspiration, nothing inserting them (R-ASK-2)', async () => {
    server()
    const screen = await mountScreen()
    const section = screen.find('[aria-labelledby="inspiration-heading"]')

    expect(section.find('h2').text()).toBe('Inspiration')
    expect(section.findAll('.mine').map((each) => each.text())).toEqual([
      'Peer feedback instead of annual reviews.',
      'A shadow organisation beside the official one.',
    ])
    expect(section.text()).toContain('Inner Motivation')
    expect(section.findAll('button')).toHaveLength(0)
    expect(section.findAll('a')).toHaveLength(0)
  })

  it.each([
    ['none yet', []],
    ['they cannot be loaded', null],
  ])('leaves inspiration out when %s (R-ASK-2)', async (_, latest) => {
    server(201, latest)
    const screen = await mountScreen()

    expect(screen.find('#inspiration-heading').exists()).toBe(false)
    expect(screen.find('[role="alert"]').exists()).toBe(false)
    expect(screen.find('textarea#challenge').exists()).toBe(true)
  })

  it('saves the challenge and goes on to its domain (R-ASK-4)', async () => {
    const fetchMock = server()
    const screen = await mountScreen()

    await screen.find('textarea').setValue(longEnough)
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/challenges',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(push).toHaveBeenCalledWith('/challenges/c%201')
  })

  it('says so when the challenge did not save', async () => {
    server(500)
    const screen = await mountScreen()

    await screen.find('textarea').setValue(longEnough)
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain('did not save')
    expect(push).not.toHaveBeenCalled()
  })

  it('keeps Submit disabled when the limits cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )
    const screen = await mountScreen()

    await screen.find('textarea').setValue(longEnough)

    expect(submitButton(screen).disabled).toBe(true)
    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })

  it('marks Describe as the current step', async () => {
    server()
    const screen = await mountScreen()

    expect(screen.find('[aria-current="step"]').text()).toContain('Describe')
  })
})
