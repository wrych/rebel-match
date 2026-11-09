// @vitest-environment jsdom
import { mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'welcome' }) }))

function mountApp(): ReturnType<typeof mount> {
  return mount(App, {
    global: {
      stubs: { RouterLink: RouterLinkStub, RouterView: true, TabBar: true },
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

  it('opens in the mode this browser chose last', () => {
    localStorage.setItem('rm_mood', 'happy')

    mountApp()

    expect(document.documentElement.dataset['mood']).toBe('happy')
  })
})
