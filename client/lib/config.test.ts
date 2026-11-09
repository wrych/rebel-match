// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import type { ClientConfig } from './api'
import { useConfig } from './config'

const FAILURE = 'This could not be loaded. Reload to try again.'

function serveLimits(limits: Partial<ClientConfig['limits']>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ limits }),
    })),
  )
}

function refuse(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503 })),
  )
}

function reader(message?: Ref<string | null>): ReturnType<typeof mount> {
  const read = (config: ClientConfig): number => config.limits.savedTickMs
  const Reader = defineComponent({
    setup() {
      const tickMs =
        message === undefined
          ? useConfig(read, null)
          : useConfig(read, null, message, FAILURE)
      return () => h('p', String(tickMs.value))
    },
  })
  return mount(Reader)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useConfig (R-CFG-2)', () => {
  it('shows the fallback until the config arrives, then what was read', async () => {
    serveLimits({ savedTickMs: 2500 })

    const shown = reader()
    expect(shown.text()).toBe('null')
    await flushPromises()

    expect(shown.text()).toBe('2500')
    expect(fetch).toHaveBeenCalledWith('/api/config')
  })

  it('reads afresh on every mount, so a host’s change shows at once (ADR 0031)', async () => {
    serveLimits({ savedTickMs: 2500 })
    reader()
    await flushPromises()

    serveLimits({ savedTickMs: 1000 })
    const again = reader()
    await flushPromises()

    expect(again.text()).toBe('1000')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the fallback and says so when the read fails', async () => {
    refuse()
    const message = ref<string | null>(null)

    const shown = reader(message)
    await flushPromises()

    expect(shown.text()).toBe('null')
    expect(message.value).toBe(FAILURE)
  })

  it('keeps the fallback when what came back cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    )
    const message = ref<string | null>(null)

    const shown = reader(message)
    await flushPromises()

    expect(shown.text()).toBe('null')
    expect(message.value).toBe(FAILURE)
  })

  it('keeps the fallback quietly when no message is given', async () => {
    refuse()

    const shown = reader()
    await flushPromises()

    expect(shown.text()).toBe('null')
  })
})
