// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OutboxScreen from './OutboxScreen.vue'

const link = `${window.location.origin}/auth/verify?token=t`
const entry = {
  id: 'o1',
  to: 'ada@example.invalid',
  kind: 'magic_link',
  subject: 'Your Rebel Match sign-in link',
  bodyText: `Sign in:\n\n${link}\n`,
  status: 'suppressed',
  error: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  sentAt: null,
}

function respondWith(entries: unknown[], ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve({ entries }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// The log answers with whatever `log()` holds when it is read.
function serve(log: () => unknown[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          url === '/api/config'
            ? { limits: { outboxPollSeconds: 8, pullRefreshPx: 70 } }
            : { entries: log() },
        ),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const later = {
  ...entry,
  id: 'o2',
  to: 'bea@example.invalid',
  createdAt: '2026-11-08T10:05:00.000Z',
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('OutboxScreen', () => {
  it('lists each message with its recipient and status (R-MSG-5)', async () => {
    respondWith([entry])

    const screen = mount(OutboxScreen)
    await flushPromises()

    expect(screen.text()).toContain('Your Rebel Match sign-in link')
    expect(screen.text()).toContain('ada@example.invalid')
    expect(screen.find('.status').text()).toBe('suppressed')
  })

  it('makes the sign-in link clickable, as development keeps it (F14)', async () => {
    respondWith([entry])

    const screen = mount(OutboxScreen)
    await flushPromises()

    expect(screen.find('pre a').attributes('href')).toBe(link)
  })

  it('filters by recipient and status', async () => {
    const fetchMock = respondWith([])
    const screen = mount(OutboxScreen)
    await flushPromises()

    await screen.find('#to').setValue('ada@example.invalid')
    await screen.find('#status').setValue('failed')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/outbox?to=ada%40example.invalid&status=failed',
    )
    expect(screen.text()).toContain('Nothing in the log matches.')
  })

  it('says so when the log cannot be loaded', async () => {
    respondWith([], false)

    const screen = mount(OutboxScreen)
    await flushPromises()

    expect(screen.find('[role="alert"]').text()).toContain(
      'could not be loaded',
    )
  })

  it('shows a message that arrives while open, outlined with its body open (R-NAV-12, R-MSG-5)', async () => {
    vi.useFakeTimers()
    let log = [entry]
    serve(() => log)
    const screen = mount(OutboxScreen)
    await flushPromises()
    expect(screen.find('.card-new').exists()).toBe(false)

    log = [later, entry]
    await vi.advanceTimersByTimeAsync(8000)

    const cards = screen.findAll('article')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.classes()).toContain('card-new')
    expect(cards[0]?.text()).toContain('New ·')
    expect(cards[0]?.find('details').attributes('open')).toBeDefined()
    expect(cards[1]?.classes()).not.toContain('card-new')
    expect(cards[1]?.find('details').attributes('open')).toBeUndefined()
    screen.unmount()
  })

  it('stops outlining a message once it is tapped', async () => {
    vi.useFakeTimers()
    let log = [entry]
    serve(() => log)
    const screen = mount(OutboxScreen)
    await flushPromises()
    log = [later, entry]
    await vi.advanceTimersByTimeAsync(8000)

    await screen.find('article').trigger('click')

    expect(screen.find('.card-new').exists()).toBe(false)
    screen.unmount()
  })

  it('keeps the filter asked for on every refresh', async () => {
    vi.useFakeTimers()
    const fetchMock = serve(() => [])
    const screen = mount(OutboxScreen)
    await flushPromises()
    await screen.find('#to').setValue('ada@example.invalid')
    await screen.find('form').trigger('submit')
    await flushPromises()

    await screen.find('#to').setValue('typed but not asked for')
    await vi.advanceTimersByTimeAsync(8000)

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/outbox?to=ada%40example.invalid',
    )
    screen.unmount()
  })

  it('outlines nothing a changed filter shows', async () => {
    let log = [entry]
    serve(() => log)
    const screen = mount(OutboxScreen)
    await flushPromises()

    log = [later]
    await screen.find('#status').setValue('suppressed')
    await screen.find('form').trigger('submit')
    await flushPromises()

    expect(screen.text()).toContain('bea@example.invalid')
    expect(screen.find('.card-new').exists()).toBe(false)
  })

  it('refreshes on the button', async () => {
    let log = [entry]
    serve(() => log)
    const screen = mount(OutboxScreen)
    await flushPromises()

    log = [later, entry]
    await screen.find('button.refresh').trigger('click')
    await flushPromises()

    expect(screen.findAll('article')).toHaveLength(2)
    expect(screen.find('.card-new').text()).toContain('bea@example.invalid')
  })
})
