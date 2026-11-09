// @vitest-environment jsdom
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { fetchConfig } from './lib/api'

vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'welcome' }) }))
vi.mock('./lib/api', () => ({
  fetchConfig: vi.fn(() => Promise.reject(new Error('offline'))),
}))

function hostsDefault(happyModeDefault: 0 | 1): void {
  vi.mocked(fetchConfig).mockResolvedValue({
    limits: { happyModeDefault },
  } as Awaited<ReturnType<typeof fetchConfig>>)
}

function mountApp(): ReturnType<typeof mount> {
  return mount(App, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        RouterView: true,
        TabBar: true,
        HeaderMenu: true,
      },
    },
  })
}

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset['mood']
})

describe('App shell', () => {
  it('carries the Rebel Match mark home (R-LOOK-5)', () => {
    const link = mountApp().findComponent(RouterLinkStub)

    expect(link.props('to')).toBe('/')
    expect(link.attributes('aria-label')).toBe('Rebel Match, home')
    expect(link.find('svg.rebel-mark').exists()).toBe(true)
  })

  it('opens in the mode this browser chose last', async () => {
    hostsDefault(0)
    localStorage.setItem('rm_mood', 'happy')

    mountApp()
    await flushPromises()

    expect(document.documentElement.dataset['mood']).toBe('happy')
  })

  it('opens a browser that never chose in the hosts’ default (R-LOOK-6)', async () => {
    hostsDefault(1)

    mountApp()
    await flushPromises()

    expect(document.documentElement.dataset['mood']).toBe('happy')
    expect(localStorage.getItem('rm_mood')).toBeNull()
  })
})
