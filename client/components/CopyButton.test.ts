// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CopyButton from './CopyButton.vue'

function mountButton(tickMs: number | null): ReturnType<typeof mount> {
  return mount(CopyButton, {
    props: { text: 'sam@example.invalid', label: 'Copy the email', tickMs },
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CopyButton', () => {
  it('copies its text, shows a tick for tickMs and says it copied', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const button = mountButton(2000)

    expect(button.attributes('aria-label')).toBe('Copy the email')
    await button.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('sam@example.invalid')
    expect(button.emitted('copied')).toHaveLength(1)
    expect(button.attributes('title')).toBe('Copied')
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(button.attributes('title')).toBe('Copy')
  })

  it('keeps the tick when no duration is known', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    const button = mountButton(null)

    await button.trigger('click')
    await flushPromises()
    vi.advanceTimersByTime(60_000)
    await flushPromises()

    expect(button.attributes('title')).toBe('Copied')
  })

  it('drops the tick and says so when the clipboard refuses', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const button = mountButton(null)

    await button.trigger('click')
    await flushPromises()
    await button.trigger('click')
    await flushPromises()

    expect(button.emitted('failed')).toHaveLength(1)
    expect(button.attributes('title')).toBe('Copy')
  })

  it('shows the tick on the last button pressed only', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    const first = mountButton(null)
    const second = mountButton(null)

    await first.trigger('click')
    await flushPromises()
    await second.trigger('click')
    await flushPromises()

    expect(first.attributes('title')).toBe('Copy')
    expect(second.attributes('title')).toBe('Copied')
  })
})
