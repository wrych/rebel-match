// @vitest-environment jsdom
import {
  enableAutoUnmount,
  flushPromises,
  mount,
  RouterLinkStub,
} from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LiveCodePanel from './LiveCodePanel.vue'

type Answer = { status: number; body?: unknown }

function server(answers: Answer[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => {
    const answer = answers.shift() ?? { status: 429 }
    return Promise.resolve({
      ok: answer.status < 300,
      status: answer.status,
      json: async () => answer.body,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const issued = (token: string, connected: string[] = []): Answer => ({
  status: 201,
  body: {
    token,
    showForSeconds: 30,
    usableUntil: '2026-11-08T10:00:40.000Z',
    connected: connected.map((name) => ({ name })),
  },
})

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

async function mounted(): Promise<ReturnType<typeof mount>> {
  const panel = mount(LiveCodePanel, {
    props: { retrySeconds: 30, name: 'Ada Lovelace' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return panel
}

const qrValue = (panel: ReturnType<typeof mount>): string =>
  panel.find('svg[aria-label="Live connect code"]').exists()
    ? String(panel.findComponent({ name: 'QrCode' }).props('value'))
    : ''

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers()
  setHidden(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LiveCodePanel (R-CODE-5, R-CODE-6)', () => {
  it('replaces the code in place every showForSeconds', async () => {
    const fetchMock = server([issued('one'), issued('two')])
    const panel = await mounted()

    expect(qrValue(panel)).toMatch(/\/c#t=one$/)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(qrValue(panel)).toMatch(/\/c#t=two$/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows who just connected, newest first', async () => {
    server([issued('one'), issued('two', ['Ben Okafor'])])
    const panel = await mounted()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(panel.text()).toContain('Just connected')
    expect(panel.text()).toContain('Ben Okafor')
  })

  it('asks for no code while the page is hidden, and at once when it shows again', async () => {
    const fetchMock = server([issued('one'), issued('two')])
    await mounted()

    setHidden(true)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    setHidden(false)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('hides the code when a new one is refused, and asks again at its next turn', async () => {
    const fetchMock = server([issued('one'), { status: 429 }, issued('three')])
    const panel = await mounted()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(qrValue(panel)).toBe('')
    expect(panel.text()).toContain('A new code comes in a moment')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(qrValue(panel)).toMatch(/\/c#t=three$/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('says so when hosts turned codes off', async () => {
    server([{ status: 404 }])
    const panel = await mounted()

    expect(panel.emitted('off')).toHaveLength(1)
  })

  it('asks one code at a time, however often the page shows again', async () => {
    let answer: ((value: unknown) => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    mount(LiveCodePanel, {
      props: { retrySeconds: 30, name: 'Ada Lovelace' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    setHidden(true)
    setHidden(false)
    setHidden(true)
    setHidden(false)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    answer?.({ ok: false, status: 429 })
    await flushPromises()
  })
})
