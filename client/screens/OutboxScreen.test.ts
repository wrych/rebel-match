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

afterEach(() => {
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
})
