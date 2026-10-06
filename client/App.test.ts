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
  it('carries the Corporate Rebels mark home', () => {
    const app = mountApp()

    expect(app.find('img').attributes('alt')).toBe('Corporate Rebels')
    expect(app.findComponent(RouterLinkStub).props('to')).toBe('/')
  })

  it('switches happy mode on and off from the menu (R-LOOK-2, R-PROF-3)', async () => {
    const app = mountApp()
    const menu = app.findComponent({ name: 'HeaderMenu' })

    menu.vm.$emit('toggleMood')
    await app.vm.$nextTick()
    expect(document.documentElement.dataset['mood']).toBe('happy')
    expect(menu.props('mood')).toBe('happy')
    menu.vm.$emit('toggleMood')
    await app.vm.$nextTick()
    expect(document.documentElement.dataset['mood']).toBe('calm')
  })

  it('opens in the mode this browser chose last', () => {
    localStorage.setItem('rm_mood', 'happy')

    mountApp()

    expect(document.documentElement.dataset['mood']).toBe('happy')
  })
})
