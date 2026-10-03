// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { challengeExamples } from '../lib/challenges'
import AskScreen from './AskScreen.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const minChars = 31
const longEnough = 'Nobody here knows who can decide what.'

/** Serves the config, and answers the submission with `status`. */
function server(status = 201): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return Promise.resolve({
        ok: status < 300,
        status,
        json: async () => ({ challenge: { id: 'c 1' } }),
      })
    return Promise.resolve({
      ok: url === '/api/config',
      status: 200,
      json: async () => ({ limits: { challengeMinChars: minChars } }),
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
      `at least ${String(minChars)}`,
    )
  })

  it('enables Submit from the configured minimum (R-ASK-3, R-CFG-2)', async () => {
    server()
    const screen = await mountScreen()

    await screen.find('textarea').setValue('x'.repeat(minChars))

    expect(submitButton(screen).disabled).toBe(false)
  })

  it('shows examples as text, with nothing that inserts them (R-ASK-2)', async () => {
    server()
    const screen = await mountScreen()
    const hints = screen.findAll('.hints li')

    expect(hints.map((hint) => hint.text())).toEqual([...challengeExamples])
    expect(screen.findAll('.hints button')).toHaveLength(0)
    expect(screen.findAll('.hints a')).toHaveLength(0)
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
